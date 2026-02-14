import PdfPrinter from "pdfmake";
import fs from "fs";
import { ToWords } from "to-words";
import { text } from "stream/consumers";

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
  return (
    "data:image/png;base64," + fs.readFileSync(filePath).toString("base64")
  );
}

// Layout = horizontal lines only
const horizontalLineLayout = {
  hLineWidth: () => 1,
  vLineWidth: () => 1,
  hLineColor: () => "#000000",
};

function generateQuotation(poData, filePath) {
  const logoBase64 = getBase64Image(poData.company.logo);
  const signBase64 = getBase64Image(poData.signPath);

  // 👉 Build the items table
  const itemsTable = [
    [
      { text: "SL", bold: true, fillColor: "#3498db", color: "white" },
      { text: "Part No.", bold: true, fillColor: "#3498db", color: "white" },
      {
        text: "Item Description",
        bold: true,
        fillColor: "#3498db",
        color: "white",
      },
      { text: "HSN", bold: true, fillColor: "#3498db", color: "white" },

      { text: "Qty", bold: true, fillColor: "#3498db", color: "white" },
      { text: "Unit", bold: true, fillColor: "#3498db", color: "white" },
      { text: "Unit Price", bold: true, fillColor: "#3498db", color: "white" },

      { text: "Total", bold: true, fillColor: "#3498db", color: "white" },
    ],
  ];

  let subtotal = 0;
  poData.items.forEach((item, i) => {
    const unitPrice = parseFloat(item.unit_price || item.unitPrice || 0);
    const quantity = parseFloat(item.quantity || 0);

    // Step 1: Base price
    const gross = unitPrice * quantity;

    // Step 2: Apply discount directly
    // const afterDiscount = gross - discount;

    // // Step 3: GST on discounted value
    // const gstAmount = afterDiscount * (gst / 100);

    // // Step 4: Final total (after discount + GST)
    const finalTotal = gross;

    subtotal += gross;

    itemsTable.push([
      i + 1,
      item.part_no || item.partNo || "",
      item.description || "",
      item.hsn_code || item.hsnCode || "",
      item.quantity || 0,

      item.unit || "",
      unitPrice.toFixed(2),

      finalTotal.toFixed(2),
    ]);
  });

  const grandTotal = subtotal;
  let formattedAddress = poData.shipTo
    ? poData.shipTo
        .split("\n") // break into lines
        .map((line) => line.trim()) // trim spaces
        .filter((line) => line) // remove empty ones
        .join(" ")
    : ""; // join with commas
  let supplierAddress = poData.supplier.address
    ? poData.supplier.address
        .split("\n") // break into lines
        .map((line) => line.trim()) // trim spaces
        .filter((line) => line) // remove empty ones
        .join("\n")
    : ""; // join with newlines
  // 👉 Document definition
         const packageLabel =
  poData.currency === "INR"
    ? "Package and Forwarding"
    : "Packaging";
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
                text: `Page ${currentPage} of ${pageCount}`,
                alignment: "right",
                fontSize: 9,
                font: "Times",
              },
            ],
          ],
        },
        layout: "noBorders",
        margin: [40, 20, 25, 0],
      };
    },
    background: [
      ...(getBase64Image("./public/images/lg.jpg")
        ? [
            {
              image: getBase64Image("./public/images/lg.jpg"), // path to your watermark image
              width: 400, // scale watermark size
              opacity: 0.08, // make it transparent
              absolutePosition: { x: 100, y: 350 }, // adjust placement
            },
          ]
        : []),
      ...(getBase64Image(poData.line)
        ? [
            {
              image: getBase64Image(poData.line), // base64 of your gradient image
              width: 5, // thickness of the strip
              height: 842, // A4 page height in pt (adjust if needed)
              absolutePosition: { x: 590, y: 0 }, // right edge (595pt is A4 width)
            },
          ]
        : []),
        
    ],
    

    content: [
      {
        text: "QUOTATION ",
        font: "Times",
        bold: true,
        fontSize: 18,
        alignment: "center",
        margin: [0, 0, 0, 20],
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
                margin: [35, 25, 0, 5],
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
                text: "E-mail : chandrashekaraiah.r@kietsindia.com",
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
                  },
                  // {
                  //   text: `Email: ${poData.company.email}`,
                  //   font: "Times",
                  //   margin: [10, 0, 0, 5],
                  // },
                  
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
                        fontSize: 10,
                      },
                      {
                        text: poData.poNumber,
                        font: "Times",
                        alignment: "right",
                        fontSize: 10,
                      },
                    ],
                    [
                      {
                        text: "Date",
                        font: "Times",
                        bold: true,
                        alignment: "left",
                        fontSize: 10,
                      },
                      {
                        text: poData.date,
                        font: "Times",
                        alignment: "right",
                        fontSize: 10,
                      },
                    ],

                    [
                      {
                        text: "Client Name",
                        font: "Times",
                        bold: true,
                        alignment: "left",
                        fontSize: 10,
                      },
                      {
                        text: poData.requester?.name,
                        font: "Times",
                        alignment: "right",
                        fontSize: 10,
                      },
                    ],
                    [
                      {
                        text: "Client Phone",
                        font: "Times",
                        bold: true,
                        alignment: "left",
                        fontSize: 10,
                      },
                      {
                        text: poData.supplier.contact,
                        font: "Times",
                        alignment: "right",
                        fontSize: 10,
                      },
                    ],
                    // [
                    //   {
                    //     text: "Reference No",
                    //     font: "Times",
                    //     bold: true,
                    //     alignment: "left",
                    //     fontSize: 10,
                    //   },
                    //   {
                    //     text: poData.reference_no,
                    //     font: "Times",
                    //     alignment: "right",
                    //     fontSize: 10,
                    //   },
                    // ],

                    [
                      {
                        text: "Valid Until",
                        font: "Times",
                        bold: true,
                        alignment: "left",
                        fontSize: 10,
                      },
                      {
                        text: poData.expected_date,
                        font: "Times",
                        alignment: "right",
                        fontSize: 10,
                      },
                    ],
                    [
                      {
                        text: "Delivery Terms",
                        font: "Times",
                        bold: true,
                        alignment: "left",
                        fontSize: 10,
                      },
                      {
                        text: poData.delivery_Sterms,
                        font: "Times",
                        alignment: "right",
                        fontSize: 10,
                      },
                    ],
                    [
                      {
                        text: "GST",
                        font: "Times",
                        bold: true,
                        alignment: "left",
                        fontSize: 10,
                      },
                      {
                        text: poData.gstterms,
                        font: "Times",
                        alignment: "right",
                        fontSize: 10,
                      },
                    ],
                    [
                      {
                        text: "Insurance",
                        font: "Times",
                        bold: true,
                        alignment: "left",
                        fontSize: 10,
                      },
                      {
                        text: poData.insurance,
                        font: "Times",
                        alignment: "right",
                        fontSize: 10,
                      },
                    ],
   

[
  {
    text: packageLabel,
    font: "Times",
    bold: true,
    alignment: "left",
    fontSize: 10,
  },
  {
    text: poData.packaging,
    font: "Times",
    alignment: "right",
    fontSize: 10,
  },
],

                    [
                      {
                        text: "Payment Terms",
                        font: "Times",
                        bold: true,
                        alignment: "left",
                        fontSize: 10,
                      },
                      {
                        text: poData.termsOfPayment || "",
                        font: "Times",
                        alignment: "right",
                        fontSize: 10,
                      },
                    ],
                    [
                      {
                        text: "Delivery Leadtime",
                        font: "Times",
                        bold: true,
                        alignment: "left",
                        fontSize: 10,
                      },
                      {
                        text: poData.supplier.duration || "",
                        font: "Times",
                        alignment: "right",
                        fontSize: 10,
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
        canvas: [{ type: "line", x1: 0, y1: 0, x2: 510, y2: 0, lineWidth: 1 }],
      },
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

      // ✅ Items Table
      {
        table: {
          widths: ["auto", "auto", "*", "auto", "auto", "auto", "auto", "auto"],
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
              {
                text: "Grand Total : ",
                bold: true,
                alignment: "right",
              },
              {
                text: `${poData.currency}. ${(
                  grandTotal.toFixed(2) * 1
                ).toLocaleString()}`,
                bold: true,
                alignment: "right",
              },
            ],
          ],
        },
        layout: horizontalLineLayout,
        margin: [0, 10, 0, 10],
        font: "Times",
      },

      {
        text: [
          { text: "Amount in words: ", font: "Times", italics: true },
          {
            text: ` ${poData.currency}. ${toWordsInstance.convert(
              grandTotal
            )} only`,
            font: "Times",
            italics: true,
            bold: true,
          },
        ],
      },

      {
        canvas: [
          {
            type: "line",
            x1: 0,
            y1: 0,
            x2: 510,
            y2: 0,
            lineWidth: 1,
            margin: [0, 10, 0, 0],
          },
        ],
      },

      {
        text: "Thank you for considering our quotation. We look forward to the opportunity to serve you and contribute to the success of your projects.",
        font: "Times",
        margin: [0, 10, 0, 0],
        lineHeight: 1.2,
        bold: true,
        fontSize: 10,
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
                text: "KIET TECHNOLOGIES PRIVATE LIMITED, 51/33, Aaryan Techpark, 3rd Cross, Bikasipura Main Rd, Vikram Nagar, Kumaraswamy Layout,Bengaluru, Karnataka - 560111",
                font: "Times",
                fontSize: 10,
                bold: true,
                margin: [0, 0, 0, 0],
                lineHeight: 1.2,
              },
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

  return new Promise((resolve, reject) => {
    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    const stream = fs.createWriteStream(filePath);

    pdfDoc.pipe(stream);
    pdfDoc.end();

    stream.on("finish", () => {
      console.log("📌 PDF successfully written:", filePath);
      resolve();
    });

    stream.on("error", (err) => {
      console.error("❌ PDF write error:", err);
      reject(err);
    });
  });
}

export default generateQuotation;
