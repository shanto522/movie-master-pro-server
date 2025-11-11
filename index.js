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
    req.userEmail = decoded.email;
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

    app.put("/movies/update/:id", verifyFireBaseToken, async (req, res) => {
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

    app.post("/movies/add", verifyFireBaseToken, async (req, res) => {
      const data = req.body;
      const result = await moviesCollection.insertOne(data);
      res.send(result);
    });

    //---------------------------------
    app.get("/genres", async (req, res) => {
      try {
        const genres = await moviesCollection.distinct("genre");
        res.send(genres);
      } catch (err) {
        res.status(500).send({ message: "Failed to fetch genres", error: err });
      }
    });
    app.get("/movies/filter", verifyFireBaseToken, async (req, res) => {
      const { genres, minRating, maxRating } = req.query;
      const filter = {};

      if (genres) filter.genre = { $in: genres.split(",") };
      if (minRating && maxRating)
        filter.rating = { $gte: Number(minRating), $lte: Number(maxRating) };

      try {
        const movies = await moviesCollection.find(filter).toArray();
        res.send(movies);
      } catch (error) {
        res
          .status(500)
          .send({ message: "Failed to fetch filtered movies", error });
      }
    });

    //--------------------------------

    app.get("/search", async (req, res) => {
      const search_text = req.query.search || "";
      try {
        const result = await moviesCollection
          .find({ title: { $regex: search_text, $options: "i" } })
          .toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Search failed", error });
      }
    });

    app.post("/wishlist", verifyFireBaseToken, async (req, res) => {
      const movie = req.body;
      const userEmail = req.userEmail;

      try {
        const exists = await wishlistCollection.findOne({
          movieId: movie.movieId,
          addedBy: userEmail,
        });

        if (exists)
          return res.status(400).send({ message: "Movie already in wishlist" });

        const wishlistMovie = {
          ...movie,
          addedBy: userEmail,
        };

        const result = await wishlistCollection.insertOne(wishlistMovie);
        res.status(201).send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to add to wishlist", error });
      }
    });

    app.get("/wishlist", verifyFireBaseToken, async (req, res) => {
      const userEmail = req.userEmail;
      const wishlist = await wishlistCollection
        .find({ addedBy: userEmail })
        .toArray();
      res.send(wishlist);
    });

    app.delete("/wishlist/:id", verifyFireBaseToken, async (req, res) => {
      const userEmail = req.userEmail;
      const id = req.params.id;

      const result = await wishlistCollection.deleteOne({
        _id: new ObjectId(id),
        addedBy: userEmail,
      });

      res.send(result);
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
