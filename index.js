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
    const paymentCollection = db.collection("payment-success");
    const usersCollection = db.collection("users");

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
    // get orders by email
    app.get("/orders", async (req, res) => {
      const email = req.query.email;
      const query = { userEmail: email };
      const result = await orderCollection.find(query).toArray();
      res.send(result);
    });

    // All orders GET API

    app.get("/orders", async (req, res) => {
      try {
        const userEmail = req.query.email;

        if (!userEmail) {
          return res.status(400).send({ message: "Email is required" });
        }
        const user = await usersCollection.findOne({ email: userEmail });

        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }
        if (user.role !== "admin" && user.role !== "librarian") {
          return res.status(403).send({ message: "Access denied" });
        }
        const orders = await orderCollection.find().toArray();
        res.send(orders);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    //API for Get Books by librarian

    app.get("/books", async (req, res) => {
      try {
        const librarianEmail = req.query.email;
        if (!librarianEmail) {
          return res.status(400).send({ message: "Email is required" });
        }
        const user = await usersCollection.findOne({ email: librarianEmail });
        if (!user) return res.status(404).send({ message: "User not found" });

        if (user.role !== "librarian" && user.role !== "admin") {
          return res.status(403).send({ message: "Access denied" });
        }
        const books = await bookCollection
          .find({ addBy: librarianEmail })
          .toArray();
        res.send(books);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Internal server error" });
      }
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

    app.post("/payment-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const newPaymentRecord = {
        orderId: paymentInfo.orderId,
        bookId: paymentInfo.bookId,
        userEmail: paymentInfo.userEmail,
        bookTitle: paymentInfo.bookTitle,
        price: parseInt(paymentInfo.price),
        status: "pending",
        createdAt: new Date(),
      };

      const savedPayment = await paymentCollection.insertOne(newPaymentRecord);

      const amount = parseInt(paymentInfo.price) * 100;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "USD",
              unit_amount: amount,
              product_data: {
                name: paymentInfo.bookTitle,
              },
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        customer_email: paymentInfo.userEmail,
        metadata: {
          paymentRecordId: savedPayment.insertedId.toString(),
        },
        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
      });
      console.log(session);
      res.send({ url: session.url });
    });

    // app.patch("/payment-success", async (req, res) => {
    //   const sessionId = req.query.session_id;

    //   const session = await stripe.checkout.sessions.retrieve(sessionId);
    //   console.log(session);
    //   if (session.payment_status === "paid") {
    //     const recordId = session.metadata.paymentRecordId;
    //     const query = { _id: new ObjectId(recordId) };
    //     const update = {
    //       $set: {
    //         status: "paid",
    //         paymentTime: new Date(),
    //         transactionId: session.payment_intent,
    //       },
    //     };

    //     const result = await paymentCollection.updateOne(query, update);
    //     return res.send({ success: true, result });
    //   }

    //   return res.send({ success: false });
    // });

    app.patch("/payment-success", async (req, res) => {
      const sessionId = req.query.session_id;

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      console.log("Stripe Session:", session);

      if (session.payment_status === "paid") {
        const recordId = session.metadata.paymentRecordId;
        const query = { _id: new ObjectId(recordId) };

        // Update payment collection
        const updatePayment = {
          $set: {
            status: "paid",
            paymentTime: new Date(),
            transactionId: session.payment_intent,
          },
        };

        const paymentUpdateResult = await paymentCollection.updateOne(
          query,
          updatePayment
        );

        //Get payment record to retrieve orderId
        const paymentRecord = await paymentCollection.findOne(query);

        const orderQuery = { _id: new ObjectId(paymentRecord.orderId) };
        const updateOrder = {
          $set: {
            status: "paid",
          },
        };

        // Update order collection also
        const orderUpdateResult = await orderCollection.updateOne(
          orderQuery,
          updateOrder
        );

        return res.send({
          success: true,
          paymentUpdateResult,
          orderUpdateResult,
        });
      }

      return res.send({ success: false });
    });

    // get api for payment success
    app.get("/payments", async (req, res) => {
      const email = req.query.email;
      if (!email) return res.send([]);

      const result = await paymentCollection
        .find({ userEmail: email })
        .toArray();
      res.send(result);
    });

    // make user API

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const exists = await usersCollection.findOne(query);

      if (exists) return res.send({ message: "User already exists" });

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // get user API

    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };

      const user = await usersCollection.findOne(query);
      res.send(user);
    });

    // get API for librarian Edit Book

    app.get("/books/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookCollection.findOne(query);

      if (!result) return res.status(404).send({ message: "Book not found" });

      res.send(result);
    });
    // patch API for librarian for Update Book

    app.patch("/books/:id", async (req, res) => {
      const id = req.params.id;
      const updateData = req.body;
      const query = { _id: new ObjectId(id) };

      const updatedDoc = {
        $set: {
          title: updateData.title,
          author: updateData.author,
          photoURL: updateData.photoURL,
          status: updateData.status,
          updatedAt: new Date(),
        },
      };

      const result = await bookCollection.updateOne(query, updatedDoc);
      res.send(result);
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
