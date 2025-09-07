import PdfPrinter from "pdfmake";
import fs from 'fs';

function generatePurchaseOrder(poData, filePath) {
  const fonts = {
    Roboto: {
      normal: "node_modules/pdfmake/fonts/Roboto-Regular.ttf",
      bold: "node_modules/pdfmake/fonts/Roboto-Medium.ttf",
      italics: "node_modules/pdfmake/fonts/Roboto-Italic.ttf",
      bolditalics: "node_modules/pdfmake/fonts/Roboto-MediumItalic.ttf",
    },
  };

  const printer = new PdfPrinter(fonts);

  // Table body for items
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
      { text: "Total", bold: true },
    ],
    ...poData.items.map((item, i) => [
      i + 1,
      item.partNo || "",
      item.description,
      item.hsn,
      item.gst + "%",
      item.qty,
      item.unit,
      item.unitPrice.toLocaleString(),
      (item.qty * item.unitPrice).toLocaleString(),
    ]),
  ];

  const subtotal = poData.items.reduce(
    (acc, item) => acc + item.qty * item.unitPrice,
    0
  );
  const cgst = subtotal * 0.09;
  const sgst = subtotal * 0.09;
  const grandTotal = subtotal + cgst + sgst;

  const docDefinition = {
    content: [
      {
        columns: [
          {
            width: "50%",
            stack: [
              { text: "Supplier Address", bold: true },
              { text: poData.supplier.name },
              { text: poData.supplier.address },
              { text: `Contact: ${poData.supplier.contact}` },
            ],
          },
          {
            width: "50%",
            stack: [
              { image: poData.company.logo, width: 120, alignment: "right" },
              { text: "PURCHASE ORDER", bold: true, alignment: "right" },
              { text: `PO No: ${poData.poNumber}`, alignment: "right" },
              { text: `Date: ${poData.date}`, alignment: "right" },
            ],
          },
        ],
      },
      { text: "\n" },
      {
        text: "Ship-to-address",
        bold: true,
      },
      { text: poData.shipTo },
      { text: "\n" },
      {
        table: {
          widths: ["auto", "*", "*", "auto", "auto", "auto", "auto", "auto", "auto"],
          body: itemsTable,
        },
        layout: "lightHorizontalLines",
      },
      {
        table: {
          widths: ["*", "auto"],
          body: [
            ["Subtotal", subtotal.toLocaleString()],
            ["CGST (9%)", cgst.toLocaleString()],
            ["SGST (9%)", sgst.toLocaleString()],
            [{ text: "Grand Total", bold: true }, { text: grandTotal.toLocaleString(), bold: true }],
          ],
        },
        layout: "noBorders",
        margin: [0, 10, 0, 0],
      },
      { text: `\nAmount in words: ${poData.amountInWords}`, italics: true },
      { text: "\nTerms & Conditions", bold: true },
      { text: poData.terms },
      {
        columns: [
          { text: "" },
          {
            stack: [
              { text: "Authorized Signatory", margin: [0, 20, 0, 0] },
              poData.signPath ? { image: poData.signPath, width: 80 } : {},
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
