import PdfPrinter from "pdfmake";
import fs from "fs";
import { ToWords } from "to-words";

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
  // ✅ keep Ubuntu only if fonts exist in your project
  Ubuntu: {
    normal: "fonts/Ubuntu-Regular.ttf",
    bold: "fonts/Ubuntu-Bold.ttf",
    italics: "fonts/Ubuntu-Italic.ttf",
    bolditalics: "fonts/Ubuntu-BoldItalic.ttf",
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
    ],
  ];

  let subtotal = 0;
  poData.items.forEach((item, i) => {
    const unitPrice = parseFloat(item.unit_price || item.unitPrice || 0);
    const quantity = parseFloat(item.quantity || 0);
    const gst = parseFloat(item.gst || 0);
    const discount = parseFloat(item.discount || 0); // flat value

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
      discount.toFixed(2),
      finalTotal.toFixed(2),
    ]);
  });

  const grandTotal = subtotal;
  let formattedAddress = poData.shipTo
    .split("\n")                 // break into lines
    .map(line => line.trim())    // trim spaces
    .filter(line => line)        // remove empty ones
    .join(" ");  
                // join with commas
  let supplierAddress = poData.supplier.address
    .split("\n")                 // break into lines
    .map(line => line.trim())    // trim spaces
    .filter(line => line)        // remove empty ones
    .join("\n");  // join with newlines
  // 👉 Document definition
  const docDefinition = {
  background: [
    {
      image: getBase64Image("./public/images/lg.jpg"), // path to your watermark image
      width: 400,          // scale watermark size
      opacity: 0.08,        // make it transparent
      absolutePosition: { x: 100, y: 350 }, // adjust placement
    },
    {
      image: getBase64Image(poData.line),   // base64 of your gradient image
      width: 5,                // thickness of the strip
      height: 842,             // A4 page height in pt (adjust if needed)
      absolutePosition: { x: 590, y: 0 } // right edge (595pt is A4 width)
    }
  ],

    content: [
      {
        text: "PURCHASE ORDER",
        font: "Times",
        bold: true,
        fontSize: 18,
        alignment: "center",
        margin: [0, 0, 0, 20],
      },
      {
        table: {
          widths: ["55%", "45%"],
          body: [
            [
              // LEFT CELL
              {
                stack: [
                  { text: "Supplier Address:", font: "Times", bold: true, margin: [10, 10, 0, 5] },
                  { text: supplierName, font: "Times", margin: [10, 0, 0, 5] },
                  { text: supplierAddress, font: "Times", margin: [10, 0, 0, 5] },
                  { text: `Supplier Number: ${poData.supplier.contact}`, font: "Times", margin: [10, 0, 0, 5] },
                  { text: `GSTIN: ${poData.supplier.gst}`, font: "Times", margin: [10, 0, 0, 5] },

                  { canvas: [{ type: "line", x1: 10, y1: 0, x2: 250, y2: 0, lineWidth: 1 }] },

                  { text: "Invoice address:", font: "Times", bold: true, margin: [10, 5, 0, 5] },
                  { text: poData.invoiceTo, font: "Times", margin: [10, 0, 0, 5],lineHeight:1.5 },

                  { canvas: [{ type: "line", x1: 10, y1: 0, x2: 250, y2: 0, lineWidth: 1 }] },

                  { text: "Ship-to address:", font: "Times", bold: true, margin: [10, 5, 0, 5] },
                  { text: formattedAddress, font: "Times", margin: [10, 0, 0, 10] },
                ],
              },

              // RIGHT CELL
              {
                table: {
                  widths: ["40%", "60%"],
                  body: [
                    [
                      {
                        image: logoBase64 || null,
                        width: 100,
                        alignment: "center",
                        colSpan: 2,
                        margin: [0, 0, 0, 10],
                        border: [false, false, false, false],
                      },
                      { text: "", border: [false, false, false, false] },
                    ],
                    [
                      { text: "PO Number", font: "Times", bold: true, alignment: "left" },
                      { text: poData.poNumber, font: "Times", alignment: "right" },
                    ],
                    [
                      { text: "Date", font: "Times", bold: true, alignment: "left" },
                      { text: poData.date, font: "Times", alignment: "right" },
                    ],
                    [
                      { text: "Project Code ", font: "Times", bold: true, alignment: "left" },
                      { text: poData?.projectcode, font: "Times", alignment: "right" },
                    ],
                    [
                      { text: "Requester Name", font: "Times", bold: true, alignment: "left" },
                      { text: poData.requester?.name, font: "Times", alignment: "right", fontSize: 12 },
                    ],
                    [
                      { text: "Reference No", font: "Times", bold: true, alignment: "left" },
                      { text: poData.reference_no, font: "Times", alignment: "right" },
                    ],
                    [
                      { text: "Goods Recipient", font: "Times", bold: true, alignment: "left" },
                      { text: poData.goodsRecipient, font: "Times", alignment: "right" },
                    ],
                    [
                      { text: "Expected Date", font: "Times", bold: true, alignment: "left" },
                      { text: poData.expected_date, font: "Times", alignment: "right" },
                    ],
                    [
                      { text: "Delivery through", font: "Times", bold: true, alignment: "left" },
                      { text: "Courier / By Hand", font: "Times", alignment: "right" },
                    ],
                    [
                      { text: "Payment Terms", font: "Times", bold: true, alignment: "left" },
                      { text: poData.termsOfPayment || "", font: "Times", alignment: "right" },
                    ],
                  ],
                },
                layout: {
                  hLineWidth: () => 1,
                  vLineWidth: () => 1,
                  hLineColor: () => "black",
                  vLineColor: () => "black",
                },
              },
            ],
          ],
        },
        layout: {
          hLineWidth: () => 1,
          vLineWidth: () => 1,
          hLineColor: () => "black",
          vLineColor: () => "black",
        },
      },

      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 510, y2: 0, lineWidth: 1 }] },

      {
        text: "With reference to the above, we are pleased to place an order with you for the following items as per the terms mentioned below. Kindly send your acceptance of this purchase order. Any clarification regarding this order will not be entertained after one week of receipt.",
        font: "Times",
        margin: [0, 15, 0, 10],
        lineHeight: 1.2,
      },

      // ✅ Items Table
      {
        table: {
          widths: ["auto", "auto", "*", "auto", "auto", "auto", "auto", "auto", "auto", "auto"],
          body: itemsTable,
        },
        layout: horizontalLineLayout,
        font: "Times",
        fontSize: 10,
      },

      // ✅ Totals Table
      {
        table: {
          widths: ["*", "auto"],
          body: [
            
            [
              { text: "Grand Total(*included with Gst*)", bold: true },
              { text:` ${poData.currency + grandTotal.toFixed(2)}`, bold: true, alignment: "right" },
            ],
          ],
        },
        layout: horizontalLineLayout,
        margin: [0, 3, 0,10],
        font: "Times",
      },

      {
        text: [
          { text: "Amount in words: ", font: "Times", italics: true },
          
          { text:` ${poData.currency+toWordsInstance.convert(grandTotal.toFixed(2))}`, font: "Times", italics: true, bold: true },
        ],
      },

      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 510, y2: 0, lineWidth: 1 ,margin:[0,2,0,0]}] },

      // ✅ Terms of Payment (fixed duplicate issue)
     

      

      {
        text: "Terms & Conditions:",
        bold: true,
        margin: [0, 20, 0, 4],
        fontSize: 12,
        font: "Times",
      },

      {
        canvas: [
          {
            type: "line",
            x1: 0,
            y1: 0,
            x2: 110,
            y2: 0,
            lineWidth: 1,
          },
        ],
        margin: [0, 0, 0, 10],
      },

      {
        ul: [
          {
            text: [
              { text: "Order & Changes – ", bold: true },
              "Purchase Orders acknowledgement is mandatory by return mail. After 48 hours, from the PO release, it is considered as acceptance and no further amendment or changes are entertained.",
            ],
            lineHeight: 1.5,
            margin: [0, 0, 0, 3],
          },
          {
            text: [
              { text: "Delivery & Packaging – ", bold: true },
              "Supplier must ensure on-time delivery, safe transport, proper packaging and follow designated delivery timings (Mon–Fri, 9:00 AM–5:00 PM).",
            ],
            lineHeight: 1.5,
            margin: [0, 0, 0, 3],
          },
          {
            text: [
              { text: "Compliance – ", bold: true },
              "Supplier must follow all the taxable laws, customs regulations, and quality/ethical standards.",
            ],
            lineHeight: 1.5,
            margin: [0, 0, 0, 3],
          },
          {
            text: [
              { text: "Prices & Charges – ", bold: true },
              "Prices are firm, inclusive of all duties, taxes, and charges unless otherwise agreed.",
            ],
            lineHeight: 1.5,
            margin: [0, 0, 0, 3],
          },
          {
            text: [
              { text: "Invoices & Documentation – ", bold: true },
              "Invoices must exactly match the PO details and must be submitted along with relevant correspondence documents (3 copies of Invoice + QC report + Compliance report). Failing any of these will lead to Non-acceptance of delivery or payment process.",
            ],
            lineHeight: 1.5,
            margin: [0, 0, 0, 3],
          },
          {
            text: [
              { text: "Inspection & Payment – ", bold: true },
              "All goods are subject to inspection and approval on each delivery and damages or failures will lead to items returned or Payment on HOLD. Payments will follow as agreed terms (based on quotation and receipt date).",
            ],
            lineHeight: 1.5,
            margin: [0, 0, 0, 3],
          },
          {
            text: [
              { text: "Modifications & Approvals – ", bold: true },
              "Any deviation in scope, specification, design, or process changes require prior written communication and approval from buyer, before further execution (Production or Dispatch).",
            ],
            lineHeight: 1.5,
            margin: [0, 0, 0, 3],
          },
          {
            text: [
              { text: "Confidentiality – ", bold: true },
              "Suppliers must keep all shared information confidential, if found any suspicious will lead to legal procedures.",
            ],
            lineHeight: 1.5,
            margin: [0, 0, 0, 3],
          },
        ],
        fontSize: 10,
        alignment: "justify",
        font: "Times",
      },

      {
        columns: [
          { text: "" },
          {
            stack: [
              { text: "**Authorized Signatory**", margin: [0, 20, 0, 0] },
              signBase64 ? { image: signBase64, width: 120 } : {},
            ],
            alignment: "right",
          },
        ],
      },
      {
        text: "**Computer generated** ",
        font: "Roboto",
        fontSize: 6,
        alignment: "center",
      },
    ],
    footer: function(currentPage, pageCount) {
  return {
    stack: [
      {
        canvas: [
          { type: 'line', x1: 0, y1: 0, x2: 520, y2: 0, lineWidth: 1 }
        ],
        margin: [0, 0, 0, 6]
      },
      {
        text: `Generated on: ${new Date().toLocaleString()}`,
        alignment: 'left',
        fontSize: 7,
        font: 'Times',
        
      },
      {
        table: {
          widths: ['*', 'auto'],
          body: [[
            { text: '' },
            { text: `Page ${currentPage} of ${pageCount}`, alignment: 'right', fontSize: 7, font: 'Times', margin: [0, 0, 0, 0] }
          ]]
        },
        layout: 'noBorders',
        margin: [0, 0, 15, 4]
      },
      {
        text: `KIET TECHNOLOGIES PRIVATE LIMITED, 51/33, Aaryan Techpark, 3rd Cross, Bikasipura Main Rd, Vikram Nagar, Kumaraswamy Layout,Bengaluru, Karnataka - 560078`,
        alignment: 'left',
        fontSize: 6,
        font: 'Times'
      }
    ],
    margin: [40, 1, 0, 10]
  };
}
  };

  const pdfDoc = printer.createPdfKitDocument(docDefinition);
  pdfDoc.pipe(fs.createWriteStream(filePath));
  pdfDoc.end();
}

export default generatePurchaseOrder;
