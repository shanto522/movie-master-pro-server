const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 3000;

const admin = require("firebase-admin");

const decoded = Buffer.from(
  process.env.FIREBASE_SERVICE_KEY,
  "base64"
).toString("utf8");
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

app.use(
  cors({
    origin: [
      "https://movie-master-pro-client.web.app",
      "http://localhost:5176",
    ],
  })
);
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
    // await client.connect();

    const db = client.db("movies-db");
    const moviesCollection = db.collection("movies");
    const wishlistCollection = db.collection("wishlist");
    const usersCollection = db.collection("users");
    app.post("/users", verifyFireBaseToken, async (req, res) => {
      const { email, name, photoURL } = req.body;
      const exists = await usersCollection.findOne({ email });

      if (exists) {
        // Update name & photoURL if changed
        await usersCollection.updateOne(
          { email },
          { $set: { name, photoURL } }
        );
        return res.send(await usersCollection.findOne({ email }));
      }

      const result = await usersCollection.insertOne({
        name: name || "",
        email,
        photoURL: photoURL || "",
        createdAt: new Date(),
      });

      res.send(await usersCollection.findOne({ email }));
    });
    // Update profile
    app.put("/profile", verifyFireBaseToken, async (req, res) => {
      try {
        const email = req.userEmail; // Firebase থেকে
        if (!email) return res.status(401).send({ message: "unauthorized" });

        const { name, photoURL } = req.body;

        const result = await usersCollection.updateOne(
          { email },
          { $set: { name, photoURL } }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: "User not found" });
        }

        const updatedUser = await usersCollection.findOne({ email });
        res.send(updatedUser);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to update profile" });
      }
    });

    app.get("/profile", verifyFireBaseToken, async (req, res) => {
      try {
        const email = req.userEmail;

        const user = await usersCollection.findOne({ email });

        // ✅ user না থাকলেও fallback
        if (!user) {
          return res.send({
            name: "",
            email,
            photoURL: "",
            createdAt: null,
          });
        }

        res.send({
          name: user.name,
          email: user.email,
          photoURL: user.photoURL,
          createdAt: user.createdAt,
        });
      } catch (err) {
        res.status(500).send({ message: "Failed to fetch profile" });
      }
    });

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

    app.get("/filter", async (req, res) => {
      const { genres, minRating, maxRating } = req.query;

      const query = {};
      if (genres) {
        const genreArray = genres.split(",");
        query.genre = { $in: genreArray };
      }
      if (minRating || maxRating) {
        query.rating = {};
        if (minRating) query.rating.$gte = parseFloat(minRating);
        if (maxRating) query.rating.$lte = parseFloat(maxRating);
      }

      try {
        const result = await moviesCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Filtering failed", error });
      }
    });

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

    // await client.db("admin").command({ ping: 1 });
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
