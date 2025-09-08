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
    ["SL", "Part No.", "Item Description", "HSN", "GST%", "Qty(N)", "Unit", "Unit Price", "Total"],
  ];

  let subtotal = 0;
  poData.items.forEach((item, i) => {
    const unitPrice = parseFloat(item.unit_price || item.unitPrice || 0);
    const quantity = item.quantity || 0;
    const gst = item.gst || "0";
    const total = unitPrice * quantity;
    subtotal += total;

    itemsTable.push([
      i + 1,
      item.part_no || item.partNo || "",
      item.description || "",
      item.hsn_code || item.hsnCode || "",
      gst + "%",
      quantity,
      item.unit || "",
      unitPrice.toFixed(2),
      total.toFixed(2),
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
              { text: "Supplier Address:", font: 'Times', bold: true, margin: [50,80 , 0, 5] },
              { text: poData.supplier.name, font: 'Times', margin:[50,0 , 0, 5] },
              { text: poData.supplier.address, font: 'Times', margin:[50,0 , 0, 5]},
              { text: `Supplier Number: ${poData.supplier.contact}`, font: 'Times', margin:[50,0 , 0, 5] },
              { text: `GSTIN: ${poData.supplier.gst}`, font: 'Times', margin:[50,0 , 0, 5] },
              
              
            ],
          },
          {
            width: "50%",
            stack: [
              logoBase64 ? { image: logoBase64, width: 100, alignment: "right" } : {},
              { canvas: [{ type: "line", x1: 0, y1: 0, x2: 250, y2: 0, lineWidth: 1 }] },
              { text: "PURCHASE ORDER", font: 'Times', bold: true, alignment: "right", margin: [0, 5, 0, 5] },
              { text: `PO Number: ${poData.poNumber}`, font: 'Times', alignment: "right" },
              { text: `Date: ${poData.date}`, font: 'Times', alignment: "right" },
             
              { text: `Plant: ${poData.requester?.plant}`, font: 'Times', alignment: "right" },
              { text: `Requester Email: ${poData.requester?.email}`, font: 'Times', alignment: "right" },

            ],
          },
        ],
      },

      { text: "\nShip-to-address: " + poData.shipTo, font: 'Times', bold: true,
        lineHeight:1.3
      },
      { text: "Invoice address: " + poData.invoiceTo, font: 'Times', bold: true ,
        lineHeight:1.3
      },
      { text: "Goods Recipient: " + poData.goodsRecipient, font: 'Times', bold: true, margin: [0, 0, 0, 10],
        lineHeight:1.3
       },

      { text: "With reference to the above, we are pleased to place an order with you...", font: 'Times', margin: [0, 0, 0, 10] },

   

  // ✅ Items Table
{
  table: {
    widths: ["auto", "auto", "*", "auto", "auto", "auto", "auto", "auto", "auto"],
    body: itemsTable,
  },
  layout: horizontalLineLayout,
},

// ✅ Totals Table (with blank row first)
{
  table: {
    widths: ["*", "auto"],
    body: [
      ["", ""], // 🔹 empty row
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
  margin: [0, 10, 0, 10],
},

      { text: `Amount in words:${toWordsInstance.convert(grandTotal.toFixed(2))}`, font: 'Times', italics: true },


// ✅ Terms BELOW totals
{ text: `Terms of Payment: ${poData.termsOfPayment}`, font: 'Times', bold: true, margin: [0, 10, 0, 0] },
{ text: `Terms of Delivery: ${poData.termsOfDelivery}`, font: 'Times', bold: true, margin: [0, 0, 0, 10] },





      { text: "KIET TECHNOLOGIES PVT LTD – TERMS AND CONDITIONS OF PURCHASE", font: 'Times', bold: true, margin: [0, 15, 0, 5] },
      
      [
  {
    text: "1. Acceptance / Modification:",
    bold: true, font: 'Ubuntu', fontSize: 10, margin: [0, 10, 0, 0],lineHeight:1.3
  },
  {
    text: "This Purchase Order (PO) is accepted when the Supplier either confirms it in writing or starts working on it. "
        + "Any extra terms, conditions, or changes suggested by the Supplier will not apply unless KIET Technologies Pvt Ltd "
        + "gives written approval and signs them officially.",
    font: 'Ubuntu', fontSize: 10, lineHeight: 1.2
  },

  {
    text: "2. Delivery, Shipment & Packaging:",
    bold: true, font: 'Ubuntu', fontSize: 10, margin: [0, 10, 0, 0],lineHeight:1.3
  },
  {
    text: "The Supplier must deliver Goods in exact quantities and on the dates mentioned in the PO. "
        + "On-time delivery is very important (time is of the essence). "
        + "If items arrive too early or too late, KIET Technologies Pvt Ltd may reject them or keep them at the Supplier’s cost.",
    font: 'Ubuntu', fontSize: 10, lineHeight: 1.2
  },

  {
    text: "3. Excusable Delay:",
    bold: true, font: 'Ubuntu', fontSize: 10, margin: [0, 10, 0, 0],lineHeight:1.3
  },
  {
    text: "Higher material costs or finding other customers with better prices are not valid reasons for delay. "
        + "If delivery is delayed by more than 14 days, KIET Technologies Pvt Ltd can cancel the PO without liability.",
   font: 'Ubuntu', fontSize: 10, lineHeight: 1.2
  },

  {
    text: "4. Delivery Terms / Risk of Loss:",
    bold: true,font: 'Ubuntu', fontSize: 10, margin: [0, 10, 0, 0],lineHeight:1.3
  },
  {
    text: "Ownership and risk of loss or damage pass based on the agreed delivery terms (F.O.B.). "
        + "Even if goods are accepted, the Supplier is still responsible if hidden damages are later found.",
    font: 'Ubuntu', fontSize: 10, lineHeight: 1.2
  },

  {
    text: "5. Import / Customs Compliance:",
    bold: true, font: 'Ubuntu', fontSize: 10, margin: [0, 10, 0, 0],lineHeight:1.3},
  {
    text: "The Supplier will bear all duties, fees, or freight charges caused by non-compliance with PO conditions.",
    font: 'Ubuntu', fontSize: 10, lineHeight: 1.2
  },

  {
    text: "6. Drawback:",
    bold: true, font: 'Ubuntu', fontSize: 10, margin: [0, 10, 0, 0],lineHeight:1.3
  },
  {
    text: "Supplier must provide all documents and assistance needed for KIET Technologies Pvt Ltd to claim duty drawback benefits.",
    font: 'Ubuntu', fontSize: 10, lineHeight: 1.2
  },

  {
    text: "7. Price:",
    bold: true, font: 'Ubuntu', fontSize: 10, margin: [0, 10, 0, 0],lineHeight:1.3},
  {
    text: "Prices are fixed and include freight, packaging, and applicable taxes. "
        + "If Supplier offers lower prices elsewhere for the same goods, KIET Technologies Pvt Ltd must be given the same price.",
    font: 'Ubuntu', fontSize: 10, lineHeight: 1.2
  },

  {
    text: "8. Invoicing & Payment:",
    bold: true,font: 'Ubuntu', fontSize: 10, margin: [0, 10, 0, 0],lineHeight:1.3},
  {
    text: "Invoices must match the PO and show part numbers, quantities, taxes, shipment details, and origin. "
        + "Payment terms are net 120 days from receipt of a correct invoice.",
   font: 'Ubuntu', fontSize: 10, lineHeight: 1.2
  },

  {
    text: "9. Set Off:",
    bold: true, font: 'Ubuntu', fontSize: 10, margin: [0, 10, 0, 0],lineHeight:1.3},
  {
    text: "KIET Technologies Pvt Ltd may deduct any amounts owed by the Supplier from payments due under this PO.",
   font: 'Ubuntu', fontSize: 10, lineHeight: 1.2
  },

  {
    text: "10. Inspection:",
    bold: true, font: 'Ubuntu', fontSize: 10, margin: [0, 10, 0, 0],lineHeight:1.3
  },
  {
    text: "Goods may be inspected and tested by KIET Technologies Pvt Ltd or its customers. "
        + "Defective or non-conforming goods may be rejected, replaced, or accepted at a reduced price.",
    font: 'Ubuntu', fontSize: 10, lineHeight: 1.2
  },

  {
    text: "11. Warranty:",
    bold: true, font: 'Ubuntu', fontSize: 10, margin: [0, 10, 0, 0],lineHeight:1.3
  },
  {
    text: "Goods are warranted for 36 months to be defect-free, compliant, merchantable, and fit for use. "
        + "Supplier must handle recalls, epidemic failures, replacements, and related costs. "
        + "Services must be professional and safe. No unauthorized use of open-source software.",
   font: 'Ubuntu', fontSize: 10, lineHeight: 1.2
  },

  {
    text: "12. Changes:",
    bold: true, font: 'Ubuntu', fontSize: 10, margin: [0, 10, 0, 0],lineHeight:1.3
  },
  {
    text: "KIET Technologies Pvt Ltd may change drawings, specifications, quantities, shipment methods, or schedules. "
        + "Supplier must submit claims for adjustments within 7 days.",
    font: 'Ubuntu', fontSize: 10, lineHeight: 1.2
  },

  {
    text: "13. Design & Process Changes:",
    bold: true, font: 'Ubuntu', fontSize: 10, margin: [0, 10, 0, 0],lineHeight:1.3
  },
  {
    text: "Supplier may not change design, materials, processes, or production location without written approval.",
    font: 'Ubuntu', fontSize: 10, lineHeight: 1.2
  },

  {
    text: "14. Stop Work:",
    bold: true, font: 'Ubuntu', fontSize: 10, margin: [0, 10, 0, 0],lineHeight:1.3
  },
  {
    text: "KIET Technologies Pvt Ltd may order Supplier to stop work for up to 120 days at no cost. "
        + "Work must restart immediately once notified.",
    font: 'Ubuntu', fontSize: 10, lineHeight: 1.2
  },

  {
    text: "15. Termination:",
    bold: true, font: 'Ubuntu', fontSize: 10, margin: [0, 10, 0, 0],lineHeight:1.3
  },
  {
    text: "KIET Technologies Pvt Ltd may terminate for breach (10 days cure) or without cause (15 days’ notice). "
        + "Only accepted goods/services before termination will be paid.",
    font: 'Ubuntu', fontSize: 10, lineHeight: 1.2
  },

  {
    text: "16. General Indemnification:",
    bold: true, font: 'Ubuntu', fontSize: 10, margin: [0, 10, 0, 0],lineHeight:1.3
  },
  {
    text: "Supplier must protect and indemnify KIET Technologies Pvt Ltd and its affiliates/customers from any losses, damages, or claims caused by goods, services, negligence, or misconduct.",
    font: 'Ubuntu', fontSize: 10, lineHeight: 1.2
  },

  {
    text: "17. Intellectual Property Indemnification:",
    bold: true, font: 'Ubuntu', fontSize: 10, margin: [0, 10, 0, 0],lineHeight:1.3
  },
  {
    text: "Supplier must defend and indemnify KIET Technologies Pvt Ltd against any intellectual property rights infringement claims connected with supplied Goods or Services.",
    font: 'Ubuntu', fontSize: 10, lineHeight: 1.2
  },

  {
    text: "18. Insurance:",
    bold: true, font: 'Ubuntu', fontSize: 10, margin: [0, 10, 0, 0],lineHeight:1.3
  },
  {
    text: "Supplier must maintain liability, product, workers’ compensation, and employer’s insurance "
        + "with coverage at least 10 times the PO value, and provide proof before delivery.",
    font: 'Ubuntu', fontSize: 10, lineHeight: 1.2
  },

  {
    text: "19. Confidentiality:",
    bold: true, font: 'Ubuntu', fontSize: 10, margin: [0, 10, 0, 0],lineHeight:1.3
  },
  {
    text: "All information shared by KIET Technologies Pvt Ltd is confidential. "
        + "Supplier must not share or use it without written permission. NDA required.",
    font: 'Ubuntu', fontSize: 10, lineHeight: 1.2
  },

  {
    text: "20. Audit:",
    bold: true, font: 'Ubuntu', fontSize: 10, margin: [0, 10, 0, 0],lineHeight:1.3
  },
  {
    text: "Supplier must keep records for 8 years and allow audit access to KIET Technologies Pvt Ltd, regulators, or customers.",
    font: 'Ubuntu', fontSize: 10, lineHeight: 1.2
  },

  {
    text: "21. Limitation of Liability:",
    bold: true,font: 'Ubuntu', fontSize: 10, margin: [0, 10, 0, 0],lineHeight:1.3
  },
  {
    text: "KIET Technologies Pvt Ltd is not responsible for indirect, incidental, or consequential damages "
        + "such as lost profits, downtime, or loss of capital.",
    font: 'Ubuntu', fontSize: 10, lineHeight: 1.2
  },

  {
    text: "22. Assignment & Subcontracting:",
    bold: true, font: 'Ubuntu', fontSize: 10, margin: [0, 10, 0, 0],lineHeight:1.3
  },
  {
    text: "Supplier may not assign or subcontract work without prior written approval. Supplier remains responsible for all work.",
    font: 'Ubuntu', fontSize: 10, lineHeight: 1.2
  },

  {
    text: "23. Compliance with Laws & Integrity:",
    bold: true, font: 'Ubuntu', fontSize: 10, margin: [0, 10, 0, 0],lineHeight:1.3
  },
  {
    text: "Supplier must comply with all laws and KIET Technologies Pvt Ltd’s Code of Conduct, "
        + "including safety, labor, and environmental standards.",
    font: 'Ubuntu', fontSize: 10, lineHeight: 1.2
  },

  {
    text: "24. Applicable Law & Forum:",
    bold: true,font: 'Ubuntu', fontSize: 10, margin: [0, 10, 0, 0],lineHeight:1.3
  },
  {
    text: "This PO is governed by Indian law. Disputes will be settled by arbitration in Bangalore (English language). "
        + "Courts in Bangalore will have jurisdiction if unresolved.",
    font: 'Ubuntu', fontSize: 10, lineHeight: 1.2
  },

  {
    text: "25. Notices:",
    bold: true, font: 'Ubuntu', fontSize: 10, margin: [0, 10, 0, 0],lineHeight:1.3
  },
  {
    text: "All official notices must be in writing and delivered personally, by courier, or certified mail.",
    font: 'Ubuntu', fontSize: 10, lineHeight: 1.2
  },

  {
    text: "26. Publicity:",
    bold: true, font: 'Ubuntu', fontSize: 10, margin: [0, 10, 0, 0],lineHeight:1.3
  },
  {
    text: "Supplier must not use KIET Technologies Pvt Ltd’s name, logo, or make public announcements "
        + "without written approval.",
    font: 'Ubuntu', fontSize: 10, lineHeight: 1.2
  },

  {
    text: "27. Waiver:",
    bold: true, font: 'Ubuntu', fontSize: 10, margin: [0, 10, 0, 0],lineHeight:1.3
  },
  {
    text: "If KIET Technologies Pvt Ltd delays or fails to enforce any term, it does not mean it waives its rights.",
   font: 'Ubuntu', fontSize: 10, lineHeight: 1.2
  },

  {
    text: "28. Severability:",
    bold: true, font: 'Ubuntu', fontSize: 10, margin: [0, 10, 0, 0],lineHeight:1.3
  },
  {
    text: "If any part of this PO is found invalid, the remaining terms will still apply.",
    font: 'Ubuntu', fontSize: 10, lineHeight: 1.2
  },

  {
    text: "29. Survival:",
    bold: true, font: 'Ubuntu', fontSize: 10, margin: [0, 10, 0, 0],lineHeight:1.3
  },
  {
    text: "Important obligations like Price, Payment, Warranty, Indemnity, Confidentiality, Insurance, and Governing Law "
        + "will remain valid even after the PO ends or is terminated.",
    font: 'Ubuntu', fontSize: 10, lineHeight: 1.2
  }
]

      ,{
        columns: [
          { text: "" },
          {
            stack: [
              { text: "Authorized Signatory", margin: [0, 20, 0, 0] },
              signBase64 ? { image: signBase64, width: 80 } : {},
            ],
            alignment: "right",
          },
        ],
      },
    ],
  };

  const pdfDoc = printer.createPdfKitDocument(docDefinition);
  pdfDoc.pipe(fs.createWriteStream(filePath));
  pdfDoc.end();
}

export default generatePurchaseOrder;
