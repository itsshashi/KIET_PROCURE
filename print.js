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
              { text: "Supplier Address:", bold: true, margin: [80,50 , 0, 5] },
              { text: poData.supplier.name ,margin:[80,0 , 0, 5] },
              { text: poData.supplier.address ,margin:[80,0 , 0, 5]},
              { text: `Supplier Number: ${poData.supplier.contact}`,margin:[80,0 , 0, 5] },
            ],
          },
          {
            width: "50%",
            stack: [
              logoBase64 ? { image: logoBase64, width: 100, alignment: "right" } : {},
              { canvas: [{ type: "line", x1: 0, y1: 0, x2: 250, y2: 0, lineWidth: 1 }] },
              { text: "PURCHASE ORDER", bold: true, alignment: "right", margin: [0, 5, 0, 5] },
              { text: `PO Number: ${poData.poNumber}`, alignment: "right" },
              { text: `Date: ${poData.date}`, alignment: "right" },
              { text: `Name of the Requester: ${poData.requester?.name}`, alignment: "right" },
              { text: `Plant: ${poData.requester?.plant}`, alignment: "right" },
              { text: `Requester Email: ${poData.requester?.email}`, alignment: "right" },
              
            ],
          },
        ],
      },

      { text: "\nShip-to-address: " + poData.shipTo, bold: true,
        lineHeight:1.3
      },
      { text: "Invoice address: " + poData.invoiceTo, bold: true ,
        lineHeight:1.3
      },
      { text: "Goods Recipient: " + poData.goodsRecipient, bold: true, margin: [0, 0, 0, 10],
        lineHeight:1.3
       },

      { text: "With reference to the above, we are pleased to place an order with you...", margin: [0, 0, 0, 10] },

   

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

      { text: `Amount in words:${toWordsInstance.convert(grandTotal.toFixed(2))}`, italics: true },


// ✅ Terms BELOW totals
{ text: `Terms of Payment: ${poData.termsOfPayment}`, bold: true, margin: [0, 10, 0, 0] },
{ text: `Terms of Delivery: ${poData.termsOfDelivery}`, bold: true, margin: [0, 0, 0, 10] },





      { text: "Terms & Conditions", bold: true, margin: [0, 10, 0, 5] },
      { text: poData.terms },

      {
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
