import PdfPrinter from "pdfmake";
import fs from "fs";

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

function generateDeliveryChallan(dcData, filePath) {
  console.log('SignPath:', dcData.signPath);
  const logoBase64 = getBase64Image(dcData.company?.logo);
  const signBase64 = getBase64Image(dcData.signPath);
  const fixedRowHeightLayout = {
  paddingTop: () => 6,
  paddingBottom: () => 6,
  hLineWidth: () => 1,
  vLineWidth: () => 1,

  // Force the renderer to use a fixed height
  cellHeight: () => 20
};


  // Build the items table
  const itemsTable = [
    [
      { text: "SL", bold: true },
      { text: "Part No.", bold: true },
      { text: "Description", bold: true },
      { text: "HSN", bold: true },
      { text: "Quantity", bold: true },
      { text: "Unit", bold: true },
      { text: "Remarks", bold: true },
    ],
  ];

  dcData.items.forEach((item, i) => {
    itemsTable.push([
      i + 1,
      item.part_no || "",
      item.description || "",
      item.hsn || "",
      item.quantity || 0,
      item.unit || "",
      item.remarks || "",
    ]);
  });

  // Document definition
  const docDefinition = {
    background: [
      {
        image: getBase64Image("./public/images/lg.jpg"), // path to your watermark image
        width: 400,          // scale watermark size
        opacity: 0.08,        // make it transparent
        absolutePosition: { x: 100, y: 350 }, // adjust placement
      },
      {
        image: getBase64Image(dcData.line),   // base64 of your gradient image
        width: 5,                // thickness of the strip
        height: 842,             // A4 page height in pt (adjust if needed)
        absolutePosition: { x: 590, y: 0 } // right edge (595pt is A4 width)
      }
    ],

    content: [
      {
        text: `DELIVERY CHALLAN( ${dcData.type.toUpperCase()})`,
        font: "Times",
        bold: true,
        fontSize: 18,
        alignment: "center",
        margin: [0, 0, 0, 20],
      },
      {
        table: {
          widths: ["50%", "50%"],
          body: [
            [
              // LEFT CELL - Consignor
              {
                stack: [
                  { text: "Consignor (From):", font: "Times", bold: true, margin: [10, 10, 0, 5] },
                  { text: dcData.consignor?.name || "", font: "Times", margin: [10, 0, 0, 5] },
                  { text: dcData.consignor?.address || "", font: "Times", margin: [10, 0, 0, 5], lineHeight: 1.5 },
                  { text: `GSTIN: ${dcData.consignor?.gst || "N/A"}`, font: "Times", margin: [10, 0, 0, 5] },

                  { canvas: [{ type: "line", x1: 10, y1: 0, x2: 250, y2: 0, lineWidth: 1 }] },

                  { text: "Consignee (To):", font: "Times", bold: true, margin: [10, 5, 0, 5] },
                  { text: dcData.consignee?.name || "", font: "Times", margin: [10, 0, 0, 5] },
                  { text: dcData.consignee?.address || "", font: "Times", margin: [10, 0, 0, 5], lineHeight: 1.5 },
                  // { text: `GSTIN: ${dcData.consignee?.gst || "N/A"}`, font: "Times", margin: [10, 0, 0, 5] },
                  // { text: `Contact: ${dcData.consignee?.contact || "N/A"}`, font: "Times", margin: [10, 0, 0, 5] },
                  { text: `Phone: ${dcData.consignee?.phone || "N/A"}`, font: "Times", margin: [10, 0, 0, 5] },
                ],
              },

              // RIGHT CELL - Challan Details
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
                      { text: "DC Number", font: "Times", bold: true, alignment: "left" },
                      { text: dcData.challanNo || "", font: "Times", alignment: "right" },
                    ],
                    [
                      { text: "Date", font: "Times", bold: true, alignment: "left" },
                      { text: dcData.challanDate || "", font: "Times", alignment: "right" },
                    ],
                    [
                      { text: "Delivery Date", font: "Times", bold: true, alignment: "left" },
                      { text: dcData.deliveryDate || "", font: "Times", alignment: "right" },
                    ],
                    [
                      { text: "Vehicle No", font: "Times", bold: true, alignment: "left" },
                      { text: dcData.vehicleNo || "N/A", font: "Times", alignment: "right" },
                    ],
                    [
                      { text: "Reason", font: "Times", bold: true, alignment: "left" },
                      { text: dcData.reason || "N/A", font: "Times", alignment: "right" },
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
        text: "We hereby deliver the following goods on the terms and conditions mentioned below:",
        font: "Times",
        margin: [0, 15, 0, 10],
        lineHeight: 1.2,
      },

      // Items Table
      // {
      //   table: {
      //     widths: ["auto", "auto", "*", "auto", "auto", "auto", "*"],
      //     body: itemsTable,
      //     height:20
      //   },
      //   layout: horizontalLineLayout,
      //   font: "Times",
      //   fontSize: 10,
      // },
      {
  table: {
    widths: ["auto", "auto", "*", "auto", "auto", "auto", "*"],
    body: itemsTable
  },
  layout: fixedRowHeightLayout,
  font: "Times",
  fontSize: 10
}
,

      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 510, y2: 0, lineWidth: 1, margin: [0, 15, 0, 0] }] },

      // Terms & Conditions
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
        { text: "1. Material Ownership: ", bold: true },
        "Goods remain the property of the consignor unless stated otherwise."
      ],
      font: "Times",
      margin: [0, 0, 0, 3]
    },
    {
      text: [
        { text: "2. Verification: ", bold: true },
        "Consignee must check goods at delivery and report issues within 48 hours."
      ],
      font: "Times",
      margin: [0, 0, 0, 3]
    },
    {
      text: [
        { text: "3. Non-Returnable: ", bold: true },
        "Goods cannot be returned without written approval from the consignor."
      ],
      font: "Times",
      margin: [0, 0, 0, 3]
    },
    {
      text: [
        { text: "4. Liability: ", bold: true },
        "After acceptance, the consignor is not responsible for loss or damage."
      ],
      font: "Times",
      margin: [0, 0, 0, 3]
    }
  ]
}
,
{
  table: {
    widths: ["33%", "33%", "34%"],
    body: [
      [
        // --- Approver Signature ---
        {
          stack: [
            {
              text: "Approver Signature",
              bold: true,
              font: "Times",
              alignment: "center",
              margin: [0, 5, 0, 8],
              decoration: "underline"
            },
            dcData.approverSign
              ? {
                  image: getBase64Image(dcData.approverSign),
                  width: 80,
                  alignment: "center",
                  margin: [0, 10, 0, 5]
                }
              : { text: "\n\n", alignment: "center" }
          ],
          margin: [0, 10, 0, 10],
          border: [true, true, true, true]
        },

        // --- Receiver Signature ---
        {
          stack: [
            {
              text: "Receiver's Signature",
              bold: true,
              font: "Times",
              alignment: "center",
              margin: [0, 5, 0, 5],
              decoration: "underline"
            },
            {
              text: "(Received in Good Condition)",
              bold: true,
              font: "Times",
              fontSize: 8,
              alignment: "center",
              margin: [0, 0, 0, 8],
              
            },
            dcData.thatToSign
              ? {
                  image: getBase64Image(dcData.thatToSign),
                  width: 80,
                  alignment: "center",
                  margin: [0, 10, 0, 5]
                }
              : { text: "\n\n", alignment: "center" }
          ],
          margin: [0, 10, 0, 10],
          border: [true, true, true, true]
        },
        

        // --- Authorized Signature ---
        {
          stack: [
            {
              text: "Authorized Signature",
              bold: true,
              font: "Times",
              alignment: "center",
              margin: [0, 5, 0, 8],
              decoration: "underline"
            },
            dcData.signPath
              ? {
                  image: getBase64Image(dcData.signPath),
                  width: 80,
                  alignment: "center",
                  margin: [0, 10, 0, 5]
                }
              : { text: "\n\n", alignment: "center" }
          ],
          margin: [0, 10, 0, 10],
          border: [true, true, true, true]
        }
      ]
    ]
  },
  layout: {
    hLineWidth: () => 1,
    vLineWidth: () => 1,
    hLineColor: () => "black",
    vLineColor: () => "black",
  },
  margin: [0, 20, 0, 10]
}

,
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

export default generateDeliveryChallan;
