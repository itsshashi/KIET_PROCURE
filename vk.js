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
  Ubuntu: {
    normal: "fonts/Ubuntu-Regular.ttf",
    bold: "fonts/Ubuntu-Bold.ttf",
    italics: "fonts/Ubuntu-Italic.ttf",
    bolditalics: "fonts/Ubuntu-BoldItalic.ttf",
  },
};

const printer = new PdfPrinter(fonts);

// Layout = horizontal lines only
const horizontalLineLayout = {
  hLineWidth: () => 1,
  vLineWidth: () => 1,
  hLineColor: () => "#000000",
};

function getBase64Image(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return "data:image/png;base64," + fs.readFileSync(filePath).toString("base64");
}

function getCurrencySymbol(currency) {
  switch (currency) {
    case 'INR': return 'Rs.';
    case 'USD': return '$';
    case 'EUR': return '€';
    default: return 'Rs.';
  }
}

function generateVKQuotation(poData, filePath) {
  const logoBase64 = getBase64Image(poData.company.logo);
  const signBase64 = getBase64Image(poData.signPath);

  // Build the items table
  
 

   

  // Calculate total KIET cost
  let totalKiet = 0;
  if (poData.kietCosts && poData.kietCosts.length > 0) {
    const totalItem = poData.kietCosts.find(item => item.description.includes('Total costs'));
    if (totalItem) totalKiet = parseFloat(totalItem.totalValue);
  } else {
    totalKiet = 246647.94;
  }

  // Build KIET Cost Calculations table
  const kietCostsTable = [
    [
      { text: "Item Description", bold: true, fillColor: '#3498db', color: 'white' },
      { text: "Price Agreement Costs", bold: true, fillColor: '#3498db', color: 'white' },
      { text: "Qty", bold: true, fillColor: '#3498db', color: 'white' },
      { text: `Total Value in ${poData.currency}`, bold: true, fillColor: '#3498db', color: 'white' },
    ],
  ];

  const currencySymbol = getCurrencySymbol(poData.currency);

  // Use dynamic data from poData.kietCosts if available, else fallback to hardcoded
  if (poData.kietCosts && poData.kietCosts.length > 0) {
    poData.kietCosts.forEach((item, index) => {
      if (item.description.includes('Total costs')) {
        // Total row with colSpan
        kietCostsTable.push([
          { text: item.description, bold: true, colSpan: 3 },
          {},
          "",
          { text: currencySymbol + item.totalValue, bold: true },
        ]);
      } else if (item.description.includes('Export packaging') || item.description.includes('Bigger box')) {
        // Export and box rows with colSpan
        kietCostsTable.push([
          { text: item.description, colSpan: 3 },
          {},
          "",
          currencySymbol + item.totalValue,
        ]);
      } else {
        // Regular item rows
        kietCostsTable.push([
          item.description,
          currencySymbol + parseFloat(item.cost).toFixed(2),
          item.qty.toString(),
          currencySymbol + item.totalValue,
        ]);
      }
    });
  } else {
    // Fallback hardcoded values
    // Standard Housing
    kietCostsTable.push([
      "Standard Housing",
      currencySymbol + "135459.52",
      "1",
      currencySymbol + "135459.52",
    ]);

    // Hypertek parts and pins
    kietCostsTable.push([
      "Hypertek parts and pins (Wiring class-2)",
      currencySymbol + "2.86",
      "35000",
      currencySymbol + "100418.42",
    ]);

    // SOK 10150
    kietCostsTable.push([
      "SOK 10150",
      currencySymbol + "10000.00",
      "1",
      currencySymbol + "10000.00",
    ]);

    // Koaxial-Stift-Radial
    kietCostsTable.push([
      "Koaxial-Stift-Radial",
      currencySymbol + "4770.00",
      "1",
      currencySymbol + "4770.00",
    ]);

    // Total row
    kietCostsTable.push([
      { text: `Total costs in ${poData.currency} (qty of 1 No.)`, bold: true, colSpan: 3 },
      {},
      "",
      { text: currencySymbol + "246647.94", bold: true },
    ]);

    // Export packaging charges included
    kietCostsTable.push([
     { text: "Export Packaging Charges", colSpan: 3 },
      {},
      "",
      currencySymbol + "2650.00",
    ]);

    // Bigger box setup
    kietCostsTable.push([
      { text: "Bigger box setup", colSpan: 3 },
      {},
      "",
      currencySymbol + "0.00",
    ]);
  }

  // Build PV Wiring Adaptor Details table
  const pvAdaptorsTable = [
    [
      { text: "Sl No", bold: true, fillColor: '#3498db', color: 'white', fontSize: 8.5,margin: [0, 10, 0, 0],textAlign: 'center' },
      { text: "PV Wiring Adaptor Family Name", bold: true, fillColor: '#3498db', color: 'white', fontSize: 8.5 ,margin: [0, 10, 0, 10],textAlign: 'center' },
      { text: "Rev NO.", bold: true, fillColor: '#3498db', color: 'white', fontSize: 8.5,margin: [0, 10, 0, 0],textAlign: 'center' },
      { text: "Coaxial Pin", bold: true, fillColor: '#3498db', color: 'white', fontSize: 8.5,margin: [0, 10, 0, 0],textAlign: 'center' },
      
      { text: "SOK", bold: true, fillColor: '#3498db', color: 'white', fontSize: 8.5,margin: [0, 10, 0, 0] ,textAlign: 'center' },
      { text: `Rate/Unit in ${poData.currency}`, bold: true, fillColor: '#3498db', color: 'white', fontSize: 8.5 ,margin: [0, 10, 0, 0],textAlign: 'center' },
      { text: "Qty.", bold: true, fillColor: '#3498db', color: 'white', fontSize: 8.5 ,margin: [0, 10, 0, 0],textAlign: 'center' },
      { text: `Total Amount ${poData.currency}`, bold: true, fillColor: '#3498db', color: 'white', fontSize: 8.5,margin: [0, 10, 0, 0] ,textAlign: 'center' },
    ]
  ];

  let pvTotal = 0;
  if (poData.pvAdaptors && poData.pvAdaptors.length > 0) {
    poData.pvAdaptors.forEach((item, i) => {
      const qty = parseFloat(item.qty || 0);
      const rate = parseFloat(item.rate || 0);
      const total = qty * rate;
      pvTotal += total;

      pvAdaptorsTable.push([
        i + 1,
        
        item.familyName || "",
        item.revNo || "",
        item.coaxialPin || "",
        
        parseFloat(item.sokQty || 0),
        currencySymbol + rate.toFixed(2),
        qty,
        currencySymbol + total.toFixed(2),
      ]);
    });
  }

  // Set grand total to the total amount from PV Wiring Adaptor Details
  const grandTotal = pvTotal;

  // Document definition
  const docDefinition = {
    header: function(currentPage, pageCount) {
      return {
        table: {
          widths: ['*', 'auto'],
          body: [
            [
              { text: 'kietsindia.com', alignment: 'left', fontSize: 9, font: 'Times', color: '#0000FF' },
              {
                stack: [
                  { text: `Page ${currentPage} of ${pageCount}`, alignment: 'right', fontSize: 9, font: 'Times' },
                  
                ]
              }
            ]
          ]
        },
        layout: 'noBorders',
        margin: [40, 20, 25, 0]
      };
    },
    background: [
      {
        image: getBase64Image("./public/images/lg.jpg"),
        width: 400,
        opacity: 0.08,
        absolutePosition: { x: 100, y: 350 },
      },
      {
        image: getBase64Image(poData.line),
        width: 5,
        height: 842,
        absolutePosition: { x: 590, y: 0 }
      }
    ],
    content: [
      {
        text: "QUOTATION",
        font: "Times",
        bold: true,
        fontSize: 18,
        alignment: "center",
        margin: [0, 0, 0, 20],
        decoration: "underline",
      },
      {
        columns: [
          logoBase64 ? {
            image: logoBase64,
            width: 120,
            margin: [0, -30, 0, 10],
          } : { text: "" },
          {
            stack: [
              { text: 'KIET TECHNOLOGIES PRIVATE LIMITED ', font: "Times", bold: true, fontSize: 9, margin: [0, 0, 0, 5] },
              { text: "CIN: U29253KA2014PTC076845 ", font: "Times", bold: true, fontSize: 7, margin: [0, 0, 0, 5] },
              { text: "GSTIN: 29AAFCK6528DIZG  ", font: "Times", bold: true, fontSize:7, margin: [0, 0, 0, 5] },
            ],
            margin: [210, -10, 0, 10],
          }
        ]
      },

      {
        table: {
          widths: ["55%", "45%"],
          body: [
            [
              // LEFT CELL
              {
                stack: [
                  
                  { text: "To,", font: "Times", bold: true, margin: [10, 30, 0, 5] },
                  { text: poData.company.name, font: "Times", bold: true, fontSize: 12, margin: [10, 0, 0, 5] },
                  { text: poData.company.address, font: "Times", margin: [10, 0, 0, 5],lineHeight:1.2 },
                
                  { text: `Email: ${poData.company.email}`, font: "Times", margin: [10, 0, 0, 5] },
                  
                  { text: `GSTIN: ${poData.company.gst}`, font: "Times", margin: [10, 0, 0, 5] },
                  
                ],
              },
              // RIGHT CELL
              {
                table: {
                  widths: ["40%", "60%"],
                  body: [
                    [
                      { text: "Quotation Number", font: "Times", bold: true, alignment: "left" },
                      { text: poData.poNumber, font: "Times", alignment: "right" },
                    ],
                    [
                      { text: "Date", font: "Times", bold: true, alignment: "left" },
                      { text: poData.date, font: "Times", alignment: "right" },
                    ],
                    [
                      { text: "Client Name", font: "Times", bold: true, alignment: "left" },
                      { text: poData.requester?.name, font: "Times", alignment: "right", fontSize: 12 },
                    ],
                    [
                    { text: `Client Contact `, font: "Times", bold: true, alignment: "left" },
                    { text: poData.supplier.contact || "", font: "Times", alignment: "right" },

                    ],
                     [
                    { text: `Client Email `, font: "Times", bold: true, alignment: "left" },
                    { text: poData.clientEmail|| "", font: "Times", alignment: "right" ,fontSize:10},

                    ],

                    [
                      { text: "Valid Until", font: "Times", bold: true, alignment: "left" },
                      { text: poData.expected_date, font: "Times", alignment: "right" },
                    ],
                    [
                      { text: "Delivery Terms", font: "Times", bold: true, alignment: "left" },
                      { text: "Ex-works/DoorStep", font: "Times", alignment: "right" },
                    ],
                    [
                      { text: "Payment Terms", font: "Times", bold: true, alignment: "left" },
                      { text: poData.termsOfPayment || "", font: "Times", alignment: "right" },
                    ],
                    [
                      { text: "Delivery Leadtime", font: "Times", bold: true, alignment: "left" },
                      { text: poData.supplier.duration || "", font: "Times", alignment: "right" },
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
        text: "Dear Sir/Madam,",
        font: "Times",
        margin: [0, 15, 0, 0],
        bold: true,
      },
      {
        text: "We are pleased to submit our formal quotation for the supply of the requested items, prepared in response to your valued inquiry. Our offer reflects our commitment to quality, timely delivery, and competitive pricing. Kindly find the details below for your review.",
        font: "Times",
        margin: [0, 15, 0, 10],
        lineHeight: 1.2,
      },
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 510, y2: 0, lineWidth: 1, margin: [0, 50, 0, 0] }]},
      
      
      
      // PV Wiring Adaptor Details Table
      {
        text: "As per Price Agreement -Document. no: con_GPAG_PUI4_54808 ",
        font: "Times",
        bold: true,
        fontSize: 14,
        margin: [0, 20, 0, 10],
      },
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 510, y2: 0, lineWidth: 1 }] },
      {
        table: {
          widths: ["auto", 160, "*", "auto", "auto", "auto", "auto", "auto"],
          body: pvAdaptorsTable,
          lineSpacing: 1.5,
          
        
        },
        layout: horizontalLineLayout,
        font: "Roboto",
        fontSize: 10,
        margin: [0, 10, 0, 10],
        lineHeight: 1.5,
        bold: true,
        alignment: "left",
        
      
      },
      // Totals Table
      {
        table: {
          widths: ["*", "auto"],
          body: [
            [
              { text: "Grand Total(*Excluded with Gst*)", bold: true },
              { text:`${poData.currency}. ${grandTotal.toFixed(2)}`, bold: true, alignment: "right" },
            ],
          ],
        },
        layout: horizontalLineLayout,
        margin: [0, 10, 0, 10],
        font: "Times",
      },
      {
        text: [
          { text: "Amount in words: ", font: "Times", italics: true ,margin: [0, 10, 0, 0]},
          { text: ` ${poData.currency}. ${toWordsInstance.convert(grandTotal)} only`, font: "Times", italics: true, bold: true },
        ],

      },
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 510, y2: 0, lineWidth: 1 }] },
      { text: "Note: Price as per the current revision. Which we mentioned in the above. If revision changes that will extra as per the contract price", font: "Roboto", bold:true ,margin: [0, 15, 0, 0],color:'purple',lineHeight:1.3},
      
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 510, y2: 0, lineWidth: 1, margin: [0, 50, 0, 0] }],pageBreak: 'before' },
      {
        text: "Cost Calculations - KIET TECHNOLOGIES PVT LTD",
        font: "Times",
        bold: true,
        fontSize: 14,
        margin: [0, 100, 0, 10],
        
      },
      {
        text: "As per Price Agreement - Document No: con_GPAG_PU14_54808",
        font: "Times",
        margin: [0, 0, 0, 10],
      },
      {
        table: {
          widths: ["*", "auto", "auto", "auto"],
          body: poData.kietCosts && poData.kietCosts.length > 0 ? kietCostsTable : [
            [
              {
                text: "No KIET Cost Calculations available",
                colSpan: 4,
                alignment: "center",
              },
              {},
              {},
              {},
            ],
          ],
        },
        layout: {
          ...horizontalLineLayout,
          paddingLeft: () => 8,
          paddingRight: () => 4,
          paddingTop: () => 10,
          paddingBottom: () => 10,
        },
        font: "Roboto",
        fontSize: 10,
        margin: [0, 0, 0, 0],
        linespacing: 1.5,
      },
      {text: 'Thank you for considering our quotation. We look forward to the opportunity to serve you and contribute to the success of your projects.', font: "Times", margin: [0, 30, 0, 0], lineHeight: 1.2,bold: true,fontSize:10 ,italics:true},
      {
        columns: [
          {
            stack: [
              { text: "Kindly place your order in favour of", font: "Times", fontSize: 8, italics: true, margin: [0, 80, 0, 5] ,decoration: 'underline'},
              { text: "KIET TECHNOLOGIES PRIVATE LIMITED, 51/33, Aaryan Techpark, 3rd Cross, Bikasipura Main Rd, Vikram Nagar, Kumaraswamy Layout,Bengaluru, Karnataka - 56011", font: "Times", fontSize: 10, bold: true, margin: [0, 0, 0, 0] ,lineHeight:1.2},
            ],
            alignment: "left",
          },
          {
            stack: [
              { text: "**Authorized Signatory**", margin: [0, 80, 0, 0] },
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
            stack: [
              {
                text: "kindly place your order in favor of,",
                alignment: 'left',
                fontSize: 6,
                font: 'Times',
                italics: true
              },
              {
                text: "KIET TECHNOLOGIES PRIVATE LIMITED, 51/33, Aaryan Techpark, 3rd Cross, Bikasipura Main Rd, Vikram Nagar, Kumaraswamy Layout,Bengaluru, Karnataka - 560111",
                alignment: 'left',
                fontSize: 6,
                font: 'Times',
                bold: true,
                margin: [0, 2, 0, 0]
              },
              signBase64 ? { image: signBase64, width: 120, alignment: 'left', margin: [0, 10, 0, 0] } : {}
            ],
            margin: [0, 3, 0, 0]
          },
          {
            text: "Thank you for your business. For more information, contact us at info@kiet.com",
            alignment: 'left',
            fontSize: 8,
            font: 'Times',
            margin: [0, 10, 0, 0]
          }
        ],
        margin: [40, 5, 0, 40]
      };
    }
  };

  const pdfDoc = printer.createPdfKitDocument(docDefinition);
  pdfDoc.pipe(fs.createWriteStream(filePath));
  pdfDoc.end();
}

export default generateVKQuotation;
