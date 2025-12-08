const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_Secrete_Key);
const port = process.env.PORT || 3000;

// midleware
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.bqrplnr.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db("book_courier_db");
    const bookCollection = db.collection("allbooks");
    const orderCollection = db.collection("all_order");

    // All Books Api

    app.get("/allbooks", async (req, res) => {
      const result = await bookCollection.find().toArray();
      res.send(result);
    });
    app.get("/allbooks/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookCollection.findOne(query);
      res.send(result);
    });

    app.post("/allbooks", async (req, res) => {
      const books = req.body;
      const result = await bookCollection.insertOne(books);
      res.send(result);
    });

    // order data
    app.post("/orders", async (req, res) => {
      const order = req.body;
      const result = await orderCollection.insertOne(order);
      res.send(result);
    });

    app.get("/orders", async (req, res) => {
      const email = req.query.email;
      const query = { userEmail: email };
      const result = await orderCollection.find(query).toArray();
      res.send(result);
    });
    app.get("/payment/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await orderCollection.findOne(query);
      res.send(result);
    });
    app.patch("/orders/:id", async (req, res) => {
      const id = req.params.id;
      const status = req.body.status;
      const query = { _id: new ObjectId(id) };
      const update = { $set: { status: status } };

      const result = await orderCollection.updateOne(query, update);
      res.send(result);
    });

    // payment API

    app.get("/payment-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const amount = parseInt(paymentInfo.price)
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
  
            price_data: {
              currency: "USD",
              unit_amount: amount,
              product_data:{
                name: paymentInfo.bookTitle
              }
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        customer_email: paymentInfo.userEmail,
        metadata:{
          bookId: paymentInfo.bookId
        },
        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
      });
      console.log(session)
      res.send({url: session.url})
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Book Courier");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
