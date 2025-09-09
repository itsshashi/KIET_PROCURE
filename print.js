import PdfPrinter from "pdfmake";
import fs from "fs";
import {ToWords} from 'to-words';


const toWordsInstance = new ToWords();


const fonts = {
  Roboto: {
    normal: "Helvetica",
    bold: "Helvetica-Bold",
    italics: "Helvetica-Oblique",
    bolditalics: "Helvetica-BoldOblique",
  },
  Times: {
    normal: "Times-Roman",
    bold: "Times-Bold",
    italics: "Times-Italic",
    bolditalics: "Times-BoldItalic",
  },
  Courier: {
    normal: "Courier",
    bold: "Courier-Bold",
    italics: "Courier-Oblique",
    bolditalics: "Courier-BoldOblique",
  },
   Ubuntu: {
    normal: "fonts/Ubuntu-Regular.ttf",
    bold: "fonts/Ubuntu-Bold.ttf",
    italics: "fonts/Ubuntu-Italic.ttf",
    bolditalics: "fonts/Ubuntu-BoldItalic.ttf"
  },
};
const printer = new PdfPrinter(fonts);

function getBase64Image(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return "data:image/png;base64," + fs.readFileSync(filePath).toString("base64");
}

// Layout = horizontal lines only
const horizontalLineLayout = {
  hLineWidth: () => 1,
  vLineWidth: () => 1,
  hLineColor: () => "#000000",
};


function generatePurchaseOrder(poData, filePath) {
  const logoBase64 = getBase64Image(poData.company.logo);
  const signBase64 = getBase64Image(poData.signPath);

  // 👉 Build the items table
 const itemsTable = [
  [
    { text: "SL", bold: true },
    { text: "Part No.", bold: true },
    { text: "Item Description", bold: true },
    { text: "HSN", bold: true },
    { text: "GST%", bold: true },
    { text: "Qty", bold: true },
    { text: "Unit", bold: true },
    { text: "Unit Price", bold: true },
    { text: "Discount", bold: true },
    { text: "Total", bold: true },
  ]
];


  let subtotal = 0;
 poData.items.forEach((item, i) => {
  const unitPrice = parseFloat(item.unit_price || item.unitPrice || 0);
  const quantity = parseFloat(item.quantity || 0);
  const gst = parseFloat(item.gst || 0);
  const discount = parseFloat(item.discount || 0); // actual value (not %)

  // Step 1: Base price
  const gross = unitPrice * quantity;

  // Step 2: Apply discount directly
  const afterDiscount = gross - discount;

  // Step 3: GST on discounted value
  const gstAmount = afterDiscount * (gst / 100);

  // Step 4: Final total (after discount + GST)
  const finalTotal = afterDiscount + gstAmount;

  subtotal += finalTotal;

  itemsTable.push([
    i + 1,
    item.part_no || item.partNo || "",
    item.description || "",
    item.hsn_code || item.hsnCode || "",
    gst + "%",
    quantity,
    item.unit || "",
    unitPrice.toFixed(2), 
    discount.toFixed(2),        // ✅ show flat discount value
          // ✅ unit price
    finalTotal.toFixed(2),      // ✅ total after discount + GST
  ]);
});

  const cgst = subtotal * 0.09;
  const sgst = subtotal * 0.09;
  const grandTotal = subtotal + cgst + sgst;

  // 👉 Document definition
  const docDefinition = {
    content: [
      {
        columns: [
          {
            width: "50%",
            stack: [
              { text: "Supplier Address:", font: 'Times', bold: true, margin: [30,40 , 0, 5] },
              { text: poData.supplier.name, font: 'Times', margin:[30,0 , 0, 5] },
              { text: poData.supplier.address, font: 'Times', margin:[30,0 , 0, 5]},
              { text: `Supplier Number: ${poData.supplier.contact}`, font: 'Times', margin:[30,0 , 0, 5] },
              { text: `GSTIN: ${poData.supplier.gst}`, font: 'Times', margin:[30,0 , 0, 15] },
              
              
            ],
          },
          {
            width: "50%",
            stack: [
              logoBase64 ? { image: logoBase64, width: 100, alignment: "right" } : {},
              { canvas: [{ type: "line", x1: 0, y1: 0, x2: 250, y2: 0, lineWidth: 1 }] },
              { text: "PURCHASE ORDER", font: 'Times', bold: true, alignment: "right", margin: [0, 10, 0, 5] },
              { text: `PO Number: ${poData.poNumber}`, font: 'Times', alignment: "right",margin: [0, 10, 0, 5]},
              { text: `Date: ${poData.date}`, font: 'Times', alignment: "right" ,margin: [0, 10, 0, 5]},
             
              { text: `Plant: ${poData.requester?.plant}`, font: 'Times', alignment: "right" ,margin: [0, 10, 0, 5]},
              { text: `Requester Email: ${poData.requester?.name}`, font: 'Times', alignment: "right" ,margin: [0, 10, 0, 5]},
              { text: `GSTIN:29AAFCK6528D1ZG`, font: 'Times', alignment: "right" ,margin: [0, 10, 0, 5]},
              { text: `reference no : ${poData.reference_no}`, font: 'Times', alignment: "right" ,margin: [0, 10, 0, 5]},

            ],
          },
        ],
      },
       // Divider line
{ canvas: [{ type: "line", x1: 0, y1: 0, x2: 530, y2: 0, lineWidth: 1 }] },

// Ship-to
{
  text: [
    { text: "Ship-to-address: ", font: 'Times', bold: true },
    { text: poData.shipTo, font: 'Times', bold: false }
  ],
  lineHeight: 1.3,
  margin: [0, 5, 0, 5]
},

// Divider line


// Invoice
{
  text: [
    { text: "Invoice address: ", font: 'Times', bold: true },
    { text: poData.invoiceTo, font: 'Times', bold: false}
  ],
  lineHeight: 1.3,
  margin: [0, 5, 0, 5]
},

// Goods Recipient
{
  text: [
    { text: "Goods Recipient: ", font: 'Times', bold: true },
    { text: poData.goodsRecipient, font: 'Times', bold: false }
  ],
  lineHeight: 1.3,
  margin: [0, 10, 0, 10]
},

{canvas: [{ type: "line", x1: 0, y1: 0, x2: 530, y2: 0, lineWidth: 1 }] }
,

      { text: "With reference to the above, we are pleased to place an order with you for the following items as per the terms mentioned below. Kindly send your acceptance of this purchase order. Any clarification regarding this order will not be entertained after one week of receipt.", font: 'Times', margin: [0, 10, 0, 20] ,lineHeight:1.2},

   

  // ✅ Items Table
{
  table: {
    widths: ["auto", "auto", "*", "auto", "auto", "auto", "auto", "auto", "auto",'auto'],
    body: itemsTable,
  },
  layout: horizontalLineLayout,
  font:"Times"
},

// ✅ Totals Table (with blank row first)
{
  table: {
    widths: ["*", "auto"],
    body: [
      
      ["Subtotal", { text: subtotal.toFixed(2), alignment: "right" ,margin:[0,0,0,0] }],
      ["CGST @ 9%", { text: cgst.toFixed(2), alignment: "right" ,margin:[0,0,0,0]}],
      ["SGST @ 9%", { text: sgst.toFixed(2) , alignment: "right",margin:[80,0,0,0]}],
      [
        { text: "Grand Total", bold: true },
        { text: grandTotal.toFixed(2), bold: true, alignment: "right" },
      ],
    ],
  },
  layout: horizontalLineLayout,
  margin: [0, 10, 0, 15],
  font:"Times"
},


      { text: `Amount in words:${toWordsInstance.convert(grandTotal.toFixed(2))}`, font: 'Times', italics: true },
{ canvas: [{ type: "line", x1: 0, y1: 0, x2: 530, y2: 0, lineWidth: 1 }] },


// ✅ Terms BELOW totals
{

  text: [
    { text: 'Terms of Payment: ', font: 'Times', bold: false },
    { text: poData.termsOfPayment, font: 'Times', bold: true }
  ],
  margin: [0, 10, 0, 0]
},


{ canvas: [{ type: "line", x1: 0, y1: 0, x2: 530, y2: 0, lineWidth: 1 }] },


{
  text: 'Terms & Conditions',
  style: 'header',
  margin: [0, 10, 0, 10],
  bold:false,
  font:'Times'
},
{
  ol: [
    { text: 'Acceptance / Modification: ', bold: false, margin: [0, 0, 0, 5], alignment: 'justify' , 
      stack: ['Orders are binding only upon written confirmation. Any modifications require mutual agreement.'] },
    { text: 'Delivery, Shipment & Packaging: ', bold: false, margin: [0, 0, 0, 5], alignment: 'justify' ,
      stack: ['Supplier must ensure timely delivery, safe shipment, and proper packaging to avoid damages.'] },
    { text: 'Excusable Delay: ', bold: false, margin: [0, 0, 0, 5], alignment: 'justify' ,
      stack: ['Delays due to force majeure (natural disasters, strikes, etc.) may be excused if communicated promptly.'] },
    { text: 'Delivery Terms / Risk of Loss: ', bold: false, margin: [0, 0, 0, 5], alignment: 'justify' ,
      stack: ['Risk transfers to the buyer only after goods are received in good condition at the agreed location.'] },
    { text: 'Import / Customs Compliance: ', bold: false, margin: [0, 0, 0, 5], alignment: 'justify' ,
      stack: ['Supplier must comply with applicable import/export and customs regulations.'] },
    { text: 'Price: ', bold: false, margin: [0, 0, 0, 5], alignment: 'justify' ,
      stack: ['Prices are firm and inclusive of all applicable duties, taxes, and charges unless agreed otherwise.'] },
    { text: 'Invoicing & Payment: ', bold: false, margin: [0, 0, 0, 5], alignment: 'justify' ,
      stack: ['Invoices must match the purchase order details. Payments will follow agreed terms.'] },
    { text: 'Inspection: ', bold: false, margin: [0, 0, 0, 5], alignment: 'justify' ,
      stack: ['All goods are subject to inspection and approval upon delivery. Non-conforming goods may be rejected.'] },
    { text: 'Warranty: ', bold: false, margin: [0, 0, 0, 5], alignment: 'justify' ,
      stack: ['Supplier warrants that goods are free from defects in material, design, and workmanship.'] },
    { text: 'Changes: ', bold: false, margin: [0, 0, 0, 5], alignment: 'justify' ,
      stack: ['Buyer reserves the right to request reasonable changes in scope, specifications, or delivery.'] },
    { text: 'Design & Process Changes: ', bold: false, margin: [0, 0, 0, 5], alignment: 'justify' ,
      stack: ['Any design or process modifications by supplier require prior written approval.'] },
    { text: 'Termination: ', bold: false, margin: [0, 0, 0, 5], alignment: 'justify' ,
      stack: ['The buyer may terminate the order for default, insolvency, or breach of contract terms.'] },
    { text: 'General Indemnification: ', bold: false, margin: [0, 0, 0, 5], alignment: 'justify' ,
      stack: ['Supplier shall indemnify the buyer against any claims arising from negligence or misconduct.'] },
    { text: 'Intellectual Property Indemnification: ', bold: false, margin: [0, 0, 0, 5], alignment: 'justify' ,
      stack: ['Supplier guarantees that goods do not infringe on any third-party intellectual property rights.'] },
    { text: 'Insurance: ', bold: false, margin: [0, 0, 0, 5], alignment: 'justify' ,
      stack: ['Supplier must maintain adequate insurance coverage for goods and liabilities.'] },
    { text: 'Confidentiality: ', bold: false, margin: [0, 0, 0, 5], alignment: 'justify' ,
      stack: ['All shared business or technical information must be kept strictly confidential.'] },
    { text: 'Audit: ', bold: false, margin: [0, 0, 0, 5], alignment: 'justify' ,
      stack: ['Buyer reserves the right to audit supplier’s compliance with contractual obligations.'] },
    { text: 'Compliance with Laws & Integrity: ', bold: false, margin: [0, 0, 0, 5], alignment: 'justify' ,
      stack: ['Supplier must comply with all applicable laws, regulations, and ethical standards.'] },
    { text: 'Applicable Law & Forum: ', bold: false, margin: [0, 0, 0, 5], alignment: 'justify' ,
      stack: ['This contract shall be governed by applicable law, and disputes settled under the agreed jurisdiction.'] },
      { text: 'Compliance with Laws: The supplier shall comply with all applicable laws, export regulations, and ethical business practices at all times. Any form of bribery, gratification, or involvement of restricted materials is strictly prohibited.', bold: false, alignment: 'justify', margin: [0, 0, 0, 5] },
    { text: 'Material Restrictions: The goods supplied must not contain iron or steel originating from sanctioned countries.', bold: false, alignment: 'justify', margin: [0, 0, 0, 5] },
    { text: 'Invoicing: All invoices must exactly match the purchase order details, clearly reference the PO number, and be submitted within three days of issuance.', bold: false, alignment: 'justify', margin: [0, 0, 0, 5] },
    { text: 'Payment Terms: Payments will be made within forty-five days from the date of goods receipt or invoice receipt, whichever is applicable.', bold: false, alignment: 'justify', margin: [0, 0, 0, 5] },
    { text: 'Delivery Timing & Routing: Deliveries will only be accepted from Monday to Friday between 9:00 AM and 5:00 PM, and must be routed through the designated material gates.', bold: false, alignment: 'justify', margin: [0, 0, 0, 5] },
    { text: 'Delivery Documentation: Each delivery must be accompanied by three copies of the invoice to ensure proper processing.', bold: false, alignment: 'justify', margin: [0, 0, 0, 5] },
    { text: 'Personnel Requirements: Supplier personnel entering the premises must wear safety shoes and carry valid identification, driving licenses, and vehicle documents.', bold: false, alignment: 'justify', margin: [0, 0, 0, 5] },
    { text: 'Right of Rejection / Termination: The buyer reserves the right to reject goods or terminate the purchase order immediately in the event of non-compliance with these conditions.', bold: false, alignment: 'justify', margin: [0, 0, 0, 5] },
  ],
  font: 'Times',
  fontSize: 10,
  lineHeight: 1.3
}


      
      
      

      ,{
        columns: [
          { text: "" },
          {
            stack: [
              { text: "**Authorized Signatory**", margin: [0, 20, 0, 0] },
              signBase64 ? { image: signBase64, width:120  } : {},
            ],
            alignment: "right",
          },
        ],

      },
      {
        text:"**Computer generated** ",font:"Roboto",fontSize:6,alignment:'center'
      }
    ],
  };

  const pdfDoc = printer.createPdfKitDocument(docDefinition);
  pdfDoc.pipe(fs.createWriteStream(filePath));
  pdfDoc.end();
}

export default generatePurchaseOrder;
