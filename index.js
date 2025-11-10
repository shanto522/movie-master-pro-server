const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 3000;

const admin = require("firebase-admin");

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

app.use(cors());
app.use(express.json());

const verifyFireBaseToken = async (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  const token = authorization.split(" ")[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.token_email = decoded.email;
    next();
  } catch {
    return res.status(401).send({ message: "unauthorized access" });
  }
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.9vhb7u9.mongodb.net/moviemaster?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const db = client.db("movies-db");
    const moviesCollection = db.collection("movies");
    const wishlistCollection = db.collection("wishlist");
    app.get("/movies", async (req, res) => {
      const result = await moviesCollection.find().toArray();
      res.send(result);
    });
    app.get("/movies/:id", async (req, res) => {
      const id = req.params.id;
      const result = await moviesCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });
    app.post("/movies", verifyFireBaseToken, async (req, res) => {
      const data = req.body;
      const result = await moviesCollection.insertOne(data);
      res.send(result);
    });
    app.put("/movies/:id", async (req, res) => {
      const id = req.params.id;
      const data = req.body;
      const objectId = new ObjectId(id);
      const filter = { _id: objectId };
      const update = {
        $set: data,
      };
      const result = await moviesCollection.updateOne(filter, update);
      res.send(result);
    });
    app.delete("/movies/:id", async (req, res) => {
      const id = req.params.id;
      const objectId = new ObjectId(id);
      const filter = { _id: objectId };
      const result = await moviesCollection.deleteOne(filter);
      res.send(result);
    });

    app.post("/wishlist", async (req, res) => {
      const movie = req.body;
      try {
        const result = await wishlistCollection.insertOne(movie);
        res.status(201).send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to add to wishlist", error });
      }
    });

    app.get("/wishlist", async (req, res) => {
      try {
        const email = req.query.email; 
        const query = email ? { addedBy: email } : {};
        const wishlist = await wishlistCollection.find(query).toArray();
        res.send(wishlist);
      } catch (error) {
        res.status(500).send({ message: "Failed to load wishlist", error });
      }
    });

    app.delete("/wishlist/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await wishlistCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to remove", error });
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
