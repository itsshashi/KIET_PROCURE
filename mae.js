import PdfPrinter from "pdfmake";
import fs from "fs";
import { ToWords } from "to-words";import { JSDOM } from "jsdom";

// Create a fake browser environment for html-to-pdfmake
const dom = new JSDOM("<!DOCTYPE html>");
global.window = dom.window;
global.document = dom.window.document;
import htmlToPdfmake from "html-to-pdfmake";








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
 
  Arial: {
    normal: "fonts/arial.ttf",
    bold: "fonts/arialbd.ttf",
    italics: "fonts/ariali.ttf",
    bolditalics: "fonts/arialbi.ttf",
  }
  
};



const printer = new PdfPrinter(fonts);

function getBase64Image(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return (
    "data:image/png;base64," + fs.readFileSync(filePath).toString("base64")
  );
}

function getCurrencySymbol(currency) {
  switch (currency) {
    case "INR":
      return "Rs.";
    case "USD":
      return "$";
    case "EUR":
      return "€";
    default:
      return "Rs.";
  }
}

function generateMAEQuotation(poData, filePath) {
  return new Promise((resolve, reject) => {
    const logoBase64 = getBase64Image(poData.company.logo);
    const signBase64 = getBase64Image(poData.signPath);
const { window } = new JSDOM("<!DOCTYPE html>");
global.window = window;
global.document = window.document;

// ---- inside generateMAEQuotation() ----

function buildMaeContent(textareaDetails) {
  // CASE A: null / empty → simple text, NO htmlToPdfmake
  if (!textareaDetails || textareaDetails.trim() === "") {
    return [{ text: "No details provided", italics: true, fontSize: 10 }];
  }



  // Some rows in your DB seem to be stored like: '<table ...</table>'
  // (with extra quotes). Strip them if present.
  let html = textareaDetails.trim();
    

// convert all ArialMT variations to Arial
html = html.replace(/font-family\s*:\s*["']?ArialMT["']?/gi, 'font-family: Arial')
           .replace(/font-family\s*:\s*["']?Arial Mt["']?/gi, 'font-family: Arial')
           .replace(/font-family\s*:\s*["']?Arial MT["']?/gi, 'font-family: Arial');

  if (html.startsWith("'") && html.endsWith("'")) {
    html = html.slice(1, -1);
  }

  // Optional: small sanitizing to avoid completely empty rows
  html = html.replace(/<tr>\s*<\/tr>/g, "");

  let nodes = htmlToPdfmake(html);

  // FIX: normalize tables so no row has undefined cells
  function normalizeTables(arr) {
    if (!Array.isArray(arr)) return;
    arr.forEach(node => {
      if (node.table && Array.isArray(node.table.body)) {
        const body = node.table.body;
        const maxCols = Math.max(...body.map(r => r.length));
        node.table.body = body.map(row => {
          const newRow = row.slice();
          for (let i = 0; i < maxCols; i++) {
            if (typeof newRow[i] === "undefined") {
              newRow[i] = { text: "" }; // fill missing cell
            }
          }
          return newRow;
        });
      }
      if (node.stack) normalizeTables(node.stack);
    });
  }

  normalizeTables(nodes);
  return nodes;
}
const maeContent = buildMaeContent(poData.textareaDetails);

    const currencySymbol = getCurrencySymbol(poData.currency);

    // 🧾 PDF Definition
    const docDefinition = {
      header: function (currentPage, pageCount) {
        return {
          table: {
            widths: ["*", "auto"],
            body: [
              [
                {
                  text: "kietsindia.com",
                  alignment: "left",
                  fontSize: 9,
                  font: "Times",
                  color: "#0000FF",
                },
                {
                  stack: [
                    {
                      text: `Page ${currentPage} of ${pageCount}`,
                      alignment: "right",
                      fontSize: 9,
                      font: "Times",
                    },
                  ],
                },
              ],
            ],
          },
          layout: "noBorders",
          margin: [40, 20, 25, 0],
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
          absolutePosition: { x: 590, y: 0 },
        },
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
            {
              stack: [
                logoBase64
                  ? {
                      image: logoBase64,
                      width: 120,
                      margin: [0, -30, 0, 10],
                    }
                  : { text: "" },
                {
                  text: "KIET TECHNOLOGIES PRIVATE LIMITED",
                  font: "Times",
                  bold: true,
                  fontSize: 10,
                  margin: [0, 0, 0, 5],
                },
                {
                  text: "CIN: U29253KA2014PTC076845",
                  font: "Times",
                  bold: true,
                  fontSize: 10,
                  margin: [0, 0, 0, 5],
                },
                {
                  text: "GSTIN: 29AAFCK6528D1ZG",
                  font: "Times",
                  bold: true,
                  fontSize: 10,
                  margin: [0, 0, 0, 5],
                },
              ],
            },
            {
              stack: [
                {
                  text: "CONTACT DETAILS",
                  font: "Times",
                  bold: true,
                  fontSize: 11,
                  margin: [35, 10, 0, 5],
                  decoration: "underline",
                  alignment: "right",
                },
                {
                  text: "CHANDRASHEKARAIAH R",
                  font: "Times",
                  bold: true,
                  fontSize: 11,
                  margin: [35, 0, 0, 5],
                  alignment: "right",
                },
                {
                  text: "Phone : +91 9620875552",
                  font: "Times",
                  bold: true,
                  fontSize: 11,
                  margin: [35, 0, 0, 5],
                  alignment: "right",
                },
                {
                  text: "Email : chandrashekaraiah.r@kietsindia.com",
                  font: "Times",
                  bold: true,
                  fontSize: 11,
                  margin: [35, 0, 0, 5],
                  alignment: "right",
                },
              ],
            },
          ],
        },

        {
          table: {
            widths: ["55%", "45%"],
            body: [
              [
                // LEFT CELL
                {
                  stack: [
                    {
                      text: "To,",
                      font: "Times",
                      bold: true,
                      margin: [10, 30, 0, 5],
                    },
                    {
                      text: poData.company.name,
                      font: "Times",
                      bold: true,
                      fontSize: 12,
                      margin: [10, 0, 0, 5],
                    },
                    {
                      text: poData.company.address,
                      font: "Times",
                      margin: [10, 0, 0, 5],
                      lineHeight: 1.2,
                    },

                    {
                      text: `Email: ${poData.company.email}`,
                      font: "Times",
                      margin: [10, 0, 0, 5],
                    },

                    {
                      text: `GSTIN: ${poData.company.gst}`,
                      font: "Times",
                      margin: [10, 0, 0, 5],
                    },
                  ],
                },
                // RIGHT CELL
                {
                  table: {
                    widths: ["40%", "60%"],
                    body: [
                      [
                        {
                          text: "Quotation Number",
                          font: "Times",
                          bold: true,
                          alignment: "left",
                          fontSize: 9,
                        },
                        {
                          text: poData.poNumber,
                          font: "Times",
                          alignment: "right",
                          fontSize: 9,
                        },
                      ],
                      [
                        {
                          text: "Date",
                          font: "Times",
                          bold: true,
                          alignment: "left",
                          fontSize: 9,
                        },
                        {
                          text: poData.date,
                          font: "Times",
                          alignment: "right",
                          fontSize: 9,
                        },
                      ],
                      [
                        {
                          text: "Client Name",
                          font: "Times",
                          bold: true,
                          alignment: "left",
                          fontSize: 9,
                        },
                        {
                          text: poData.requester?.name,
                          font: "Times",
                          alignment: "right",
                          fontSize: 9,
                        },
                      ],
                      [
                        {
                          text: `Client Contact `,
                          font: "Times",
                          bold: true,
                          alignment: "left",
                          fontSize: 9,
                        },
                        {
                          text: poData.company.contact || "",
                          font: "Times",
                          alignment: "right",
                          fontSize: 9,
                        },
                      ],
                      [
                        {
                          text: `Client Email `,
                          font: "Times",
                          bold: true,
                          alignment: "left",
                          fontSize: 9,
                        },
                        {
                          text: poData.clientEmail || "",
                          font: "Times",
                          alignment: "right",
                          fontSize: 9,
                        },
                      ],

                      [
                        {
                          text: "Valid Until",
                          font: "Times",
                          bold: true,
                          alignment: "left",
                          fontSize: 9,
                        },
                        {
                          text: poData.expected_date,
                          font: "Times",
                          alignment: "right",
                          fontSize: 9,
                        },
                      ],
                      [
                        {
                          text: "Payment Terms",
                          font: "Times",
                          bold: true,
                          alignment: "left",
                          fontSize: 9,
                        },
                        {
                          text: poData.termsOfPayment || "",
                          font: "Times",
                          alignment: "right",
                          fontSize: 9,
                        },
                      ],
                      [
                        {
                          text: "GST Terms",
                          font: "Times",
                          bold: true,
                          alignment: "left",
                          fontSize: 9,
                        },
                        {
                          text: poData.gstterms || "",
                          font: "Times",
                          alignment: "right",
                          fontSize: 9,
                        },
                      ],
                      [
                        {
                          text: "Insurance",
                          font: "Times",
                          bold: true,
                          alignment: "left",
                          fontSize: 9,
                        },
                        {
                          text: poData.insurance || "",
                          font: "Times",
                          alignment: "right",
                          fontSize: 9,
                        },
                      ],
                      [
                        {
                          text: "Warranty",
                          font: "Times",
                          bold: true,
                          alignment: "left",
                          fontSize: 9,
                        },
                        {
                          text: poData.warranty || "",
                          font: "Times",
                          alignment: "right",
                          fontSize: 9,
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

        {
          canvas: [
            { type: "line", x1: 0, y1: 0, x2: 510, y2: 0, lineWidth: 1 },
          ],
        },
         {
  text: "Document Reference:",
  font: "Times",
  margin: [0, 30, 10, 6],
  alignment: "left",
  fontSize: 15,
  bold: true,
},
{
  canvas: [
    { type: "line", x1: 0, y1: 0, x2: 510, y2: 0, lineWidth: 1 }
  ],
},
{
  text: "KIET TECHNOLOGIES PRIVATE LIMITED",
  font: "Times",
  margin: [0, 30, 10, 10],
  alignment: "center",
  fontSize: 14,
  bold: true,
},

{
  text: "ISO 9001:2015 Certified Company",
  font: "Times",
  margin: [0, 10, 10, 18],
  alignment: "center",
  fontSize: 14,
  bold: true,
},

{
  text: "The Idea Factory Limited is rated **CRISIL SME–6**, indicating a high level of creditworthiness compared to other SMEs.",
  font: "Times",
  margin: [0, 25, 10, 12],
  alignment: "justify",
  fontSize: 12,
  lineHeight: 1.4,
},
{
  canvas: [
    { type: "line", x1: 0, y1: 0, x2: 510, y2: 0, lineWidth: 1 }
  ],
},

{
  text: "Confidential",
  font: "Times",
  margin: [0, 25, 10, 6],
  alignment: "left",
  fontSize: 12,
  bold: true,
  decoration: "underline",
},

{
  text:
    "All product specifications, functional requirements, product features, and the technologies implemented to achieve those functionalities described in this document are strictly confidential and proprietary to KIET Technologies Private Limited. No information, either partially or fully, may be disclosed, copied, or shared with any third party without prior written approval from KIET Technologies Private Limited, Bengaluru.",
  font: "Times",
  margin: [0, 5, 10, 12],
  alignment: "justify",
  fontSize: 12,
  italics: true,
  lineHeight: 1.45,
},

{
  text: [
    { text: "We hereby assure you that all data and information furnished by ", bold: false },
    { text:  poData.company.name|| "", bold: true },
    { text: " shall be treated with the highest level of confidentiality.", bold: false }
  ],
  margin: [0, 10, 10, 5],
  alignment: "justify",
  fontSize: 12,
  font: "Times",
  lineHeight: 1.35,
},

{ text: "", pageBreak: "before" }
,
{
  stack: [
    { text: "To", bold: true, margin: [0, 30, 0, 2] },
    { text: `${poData.company.name},`, margin: [0, 3, 0, 2] },
    { text: poData.company.address, margin: [0, 3, 0, 12] },
    {text:`Date : ${poData.date}`,margin: [0,3,0,12] ,bold:true},

    { text: "Respected Sir,", bold: true, margin: [0, 0, 0, 8] },
    { text: `Kind Attention: ${poData.requester.name || ""}`, bold: true, margin: [0, 0, 0, 12] },

    { text: `Subject: Quotation for Design, Development, Manufacturing, Supply, and Installation of  ${poData.machine || ""}`, bold: true, decoration: "underline", margin: [0, 0, 0, 6] },
    { text: `Ref: ${poData.reference || ""}`, italics: true, margin: [0, 0, 0, 14] },

{
  text: `
We would like to thank you for the opportunity to submit our techno-commercial proposal for the design, development, manufacturing, supply, and installation of the ${poData.machine || " "}.We trust that our technical concept meets your requirements. However, should you have any queries, we would be pleased to clarify them.We assure you of our best service and attention at all times.
`,
  margin: [0, 0, 0, 14],
  alignment: "justify",
  lineHeight: 1.5
}
,
    {
      text:
        "The following pages capture our detailed understanding of the systems based on various discussions held with your team. " +
        "Kindly find the enclosed files for your review. As requested, the commercial breakup is provided below.",
      margin: [0, 0, 0, 14],
      alignment: "justify",
      lineHeight: 1.5
    },

    {
      text:
        "We hope that our proposal aligns with your requirements. Please feel free to contact us for any further clarifications.",
      margin: [0, 0, 0, 25],
      alignment: "justify",
      lineHeight: 1.5
    },

    { text: "Thanking you,", margin: [0, 15, 0, 5] },
    { text: "With best regards,", margin: [0, 0, 0, 18] },

    { text: `KIET TECHNOLOGIES PRIVATE LIMITED`, bold: true, margin: [0, 0, 0, 30] },

    // Signature
    signBase64
      ? { image: signBase64, width: 120, margin: [0, 0, 0, 6] }
      : { text: "[Authorised Signature]", italics: true, margin: [0, 0, 0, 6] },

    { text: "Authorised Signatory", bold: true, margin: [0, 10, 0, 0] }
  ],
  font: "Times",
  fontSize: 11,
  lineHeight: 1.45,
  margin: [0, 50, 0, 20],
  alignment: "left"
}

,
        
        
        

        
        
        {
          canvas: [
            {
              type: "line",
              x1: 0,
              y1: 0,
              x2: 510,
              y2: 0,
              lineWidth: 1,
              margin: [0, 50, 0, 0],
            },
          ],
        },
        { text: "", pageBreak: "before" },

        // MAE Details Section
       {
  text: "Material Acquisition Estimate (MAE) Details",
  font: "Times",
  bold: true,
  fontSize: 14,
  margin: [0, 20, 0, 10],
},
{
  canvas: [
    { type: "line", x1: 0, y1: 0, x2: 510, y2: 0, lineWidth: 1 },
  ],
},
{
  margin: [0, 15, 0, 15],
  stack: maeContent,   // <-- NOT "text:", use the converted content
},


        // Totals Table (if applicable)
        poData.totalAmount ? {
          table: {
            widths: ["*", "auto"],
            body: [
              [
                { text: "Total Amount", bold: true, alignment: "right" },
                {
                  text: `${poData.currency}. ${poData.totalAmount.toLocaleString()}`,
                  bold: true,
                  alignment: "left",
                },
              ],
            ],
          },
          layout: {
            hLineWidth: () => 1,
            vLineWidth: () => 1,
            hLineColor: () => "#000000",
          },
          margin: [0, 5, 0, 10],
          font: "Times",
        } : {},

        // Amount in words
        poData.totalAmount ? {
          text: [
            {
              text: "Amount in words: ",
              font: "Times",
              italics: true,
              margin: [0, 5, 0, 0],
            },
            {
              text: ` ${poData.currency}. ${toWordsInstance.convert(poData.totalAmount)} only`,
              font: "Times",
              italics: true,
              bold: true,
            },
          ],
        } : {},

        {
          canvas: [
            { type: "line", x1: 0, y1: 0, x2: 510, y2: 0, lineWidth: 1 },
          ],
        },

        {
          text: "Thank you for considering our quotation. We look forward to the opportunity to serve you and contribute to the success of your projects.",
          font: "Times",
          margin: [0, 30, 0, 0],
          lineHeight: 1.2,
          bold: true,
          fontSize: 10,
          italics: true,
        },
        {
          columns: [
            {
              stack: [
                {
                  text: "Kindly place your order in favour of",
                  font: "Times",
                  fontSize: 8,
                  italics: true,
                  margin: [0, 80, 0, 5],
                  decoration: "underline",
                },
                {
                  text: "KIET TECHNOLOGIES PRIVATE LIMITED, 51/33, Aaryan Techpark, 3rd Cross, Bikasipura Main Rd, Vikram Nagar, Kumaraswamy Layout,Bengaluru, Karnataka - 56011",
                  font: "Times",
                  fontSize: 10,
                  bold: true,
                  margin: [0, 0, 0, 0],
                  lineHeight: 1.2,
                },
              ],
              alignment: "left",
            },
            // {
            //   stack: [
            //     { text: "**Authorized Signatory**", margin: [0, 80, 0, 0] },
            //     signBase64 ? { image: signBase64, width: 120 } : {},
            //   ],
            //   alignment: "right",
            // },
          ],
        },
        {
          text: "**Computer generated** ",
          font: "Roboto",
          fontSize: 6,
          alignment: "center",
        },
      ],
      footer: function (currentPage, pageCount) {
        return {
          stack: [
            {
              canvas: [
                { type: "line", x1: 0, y1: 0, x2: 520, y2: 0, lineWidth: 1 },
              ],
              margin: [0, 0, 0, 6],
            },
            {
              text: `Generated on: ${new Date().toLocaleString()}`,
              alignment: "left",
              fontSize: 7,
              font: "Times",
            },
            {
              stack: [
                {
                  text: "kindly place your order in favor of,",
                  alignment: "left",
                  fontSize: 6,
                  font: "Times",
                  italics: true,
                },
                {
                  text: "KIET TECHNOLOGIES PRIVATE LIMITED, 51/33, Aaryan Techpark, 3rd Cross, Bikasipura Main Rd, Vikram Nagar, Kumaraswamy Layout,Bengaluru, Karnataka - 560111",
                  alignment: "left",
                  fontSize: 6,
                  font: "Times",
                  bold: true,
                  margin: [0, 2, 0, 0],
                },
                signBase64
                  ? {
                      image: signBase64,
                      width: 120,
                      alignment: "left",
                      margin: [0, 10, 0, 0],
                    }
                  : {},
              ],
              margin: [0, 3, 0, 0],
            },
            {
              text: "Thank you for your business. For more information, contact us at info@kiet.com",
              alignment: "left",
              fontSize: 8,
              font: "Times",
              margin: [0, 10, 0, 0],
            },
          ],
          margin: [40, 5, 0, 40],
        };
      },
    };

    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    const writeStream = fs.createWriteStream(filePath);
    pdfDoc.pipe(writeStream);
    pdfDoc.end();

    writeStream.on("finish", () => {
      resolve();
    });
    writeStream.on("error", (err) => {
      reject(err);
    });
  });
}

export default generateMAEQuotation;