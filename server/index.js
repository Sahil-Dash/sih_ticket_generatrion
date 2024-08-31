const express = require("express");
const cors = require("cors");
const QRCode = require("qrcode");
const sharp = require("sharp");
const Jimp = require("jimp");
const fs = require("fs");
const Mailjet = require("node-mailjet");
const mysql = require("mysql2");

// MySQL database connection
const db = mysql.createConnection({
  host: "sihdbconnection.cvu4owusgq3p.ap-south-1.rds.amazonaws.com",
  user: "sih2024",
  password: "sih12345.",
  database: "Travel_Chatbot",
});

db.connect((err) => {
  if (err) {
    console.error("Error connecting to MySQL:", err);
    return;
  }
  console.log("Connected to MySQL");
});

const app = express();
const port = 3000;

app.use(express.json());
app.use(cors({ origin: ["http://localhost:5173/"] }));

const sendTicketMail = (base64String, email = null, ticket_id) => {
  if (email === null || email == "null") {
    return;
  }

  const pubkey = "7773977fa4c821182c2e6c0b39ccf93b";
  const seckey = "e4658c43c7eeca489681e1be54e5001a";

  const mailjet = Mailjet.apiConnect(pubkey, seckey);

  const request = mailjet.post("send", { version: "v3.1" }).request({
    Messages: [
      {
        From: {
          Email: "ashish.kumar.samantaray2003@gmail.com",
          Name: "Ashish Kumar Samantaray",
        },
        To: [
          {
            Email: email,
            Name: ticket_id,
          },
        ],
        Subject: "SANGRAMITRA Test Email",
        TextPart:
          "Dear users, welcome to the advanced AI based ticketing system",
        HTMLPart:
          "<h3>Welcome to SangrahaMitra</h3><br/>May the museum visit be flawless",
        Attachments: [
          {
            ContentType: "image/png",
            Filename: `ticket_${ticket_id}.png`,
            Base64Content: base64String,
          },
        ],
      },
    ],
  });

  request
    .then((result) => {
      console.log(result.body);
    })
    .catch((err) => {
      console.log(err);
    });
};

const genimage = async function generateTicket(ticketid) {
  const data = {
    Tid: ticketid,
  };

  try {
    //Generate QR Code
    const qrCodeDataUrl = await QRCode.toDataURL(JSON.stringify(data));

    // Load the ticket template image
    const img2 = await sharp("rsc_tickettemp.png")
      .resize({ height: 400 })
      .toBuffer(); // Adjust height as needed

    // Get metadata of the ticket template image
    const img2Metadata = await sharp(img2).metadata();

    // Step 2:QR code image buffer

    const qrBuffer = await sharp(
      // eslint-disable-next-line no-undef
      Buffer.from(qrCodeDataUrl.split(",")[1], "base64")
    )
      .resize({ width: 400, height: 400 })
      .toBuffer();

    // Get metadata of the QR code image
    const qrMetadata = await sharp(qrBuffer).metadata();

    // Step 3:text image using Jimp
    db.query(
      "SELECT * FROM Ticket WHERE ticket_id= ?",
      [ticketid],
      async (err, ticketData) => {
        if (err) {
          console.log("Error :-", err);
        }
        console.log(ticketData);

        const dft = {
          Name: ticketData[0].name,
          museumname: ticketData[0].museum_name,
          eventsname: ticketData[0].events,
          noa: ticketData[0].no_of_adults,
          noc: ticketData[0].no_of_children,
          nof: ticketData[0].no_of_foreigners,
        };

        console.log(dft);

        const text = `Name:${dft.Name} / Museum:${dft.museumname} / Event: ${dft.eventsname} / Adults:${dft.noa} / Children:${dft.noc} / Foreigner: ${dft.nof}`; //name,museumname,events
        const textImage = await new Jimp(1300, 60, 0xffffffff); // Create a white background
        const font = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK); // Load a font
        textImage.print(font, 10, 10, text); // Print text on the image

        //text image to buffer
        const textBuffer = await textImage.getBufferAsync(Jimp.MIME_PNG);

        // Get metadata of the text image
        const textMetadata = await sharp(textBuffer).metadata();

        const finalImage = await sharp({
          create: {
            width: img2Metadata.width + qrMetadata.width,
            height: img2Metadata.height + textMetadata.height,
            channels: 3,
            background: { r: 255, g: 255, b: 255 },
          },
        }).composite([
          { input: img2, top: 0, left: 0 },
          { input: qrBuffer, top: 0, left: img2Metadata.width },
          { input: textBuffer, top: img2Metadata.height, left: 0 },
        ]);

        await finalImage.toFile("ticket.png");
        console.log("file created");
      }
    );

    // Step 4: Combine images
  } catch (error) {
    console.error("Error generating ticket:", error.message);
  }
};

app.get("/api/generate-image/:ticketid/:emailid", async (req, res) => {
  const tid = req.params.ticketid;
  const eid = req.params.emailid;

  console.log(tid, eid);

  await genimage(tid).catch((err) => console.error(err));

  // Wait 2 secs for the genimage resolve and file is created successfully..
  await new Promise((resolve) => setTimeout(resolve, 5000));

  const ticketFile = "./rsc_tickettemp.png";

  fs.readFile(ticketFile, (err, data) => {
    if (err) {
      console.error("Error reading file:", err);
      res.status(500).send("Error reading file");
    } else {
      const base64Data = data.toString("base64");
      sendTicketMail(base64Data, eid, tid);
      res.json({ imageData: base64Data, ticket_id: tid });
    }

    // Delete the file after sending
    fs.unlink(ticketFile, (err) => {
      if (err) {
        console.error("Error deleting file:", err);
      } else {
        console.log("File deleted successfully");
      }
    });
  });
});

app.get("/", (req, res) => {
  res.json({ msg: "Server is working..." });
});

app.get("/check", (req, res) => {
  res.json({ msg: "Server is checked..." });
});
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
