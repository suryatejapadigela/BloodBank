const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const session = require('express-session');
const dotenv = require("dotenv");
const bcrypt = require('bcrypt');
const path = require('path');

// Initialize Express app
const app = express();
dotenv.config();

const port = process.env.PORT || 5000;

const username = process.env.MONGODB_USERNAME;
const password = process.env.MONGODB_PASSWORD;
const dbName = process.env.MONGODB_DBNAME || 'LifeLine';

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public')); // Serve static files from the public directory
app.set('view engine', 'ejs'); // Set EJS as the view engine

// Use the session middleware
app.use(session({
  secret: process.env.SESSION_KEY,
  resave: false,
  saveUninitialized: false
}));

// Improved MongoDB connection with error handling
mongoose.connect(`mongodb+srv://${username}:${password}@lifeline.ob874ee.mongodb.net/LifeLine`);

// Define Schemas
const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  BloodGroup: { type: String, required: true },
  number: { type: Number, required: true },
  password: { type: String, required: true }
});

const donorSchema = new mongoose.Schema({
  donorName: { type: String, required: true },
  bloodGroup: { type: String, required: true },
  location: { type: String, required: true },
  phoneNumber: { type: Number, required: true }
});

const hospSchema = new mongoose.Schema({
  HospName: { type: String, required: true },
  DocName: { type: String, required: true },
  hospID: { type: Number, required: true },
  password: { type: String, required: true }
});

const pendingSchema = new mongoose.Schema({
  patientname: { type: String, required: true },
  phonenumber: { type: Number, required: true },
  HospitalName: { type: String, required: true },
  HosptialID: { type: Number, required: true },
  BloodGroup: { type: String, required: true },
  Location: { type: String, required: true },
  Validate: { type: Number, default: 0 }
});

// Create Models
const User = mongoose.model('User', userSchema);
const HospUser = mongoose.model('HospUser', hospSchema);
const Pending = mongoose.model('Pending', pendingSchema);
const Donor = mongoose.model('Donor', donorSchema);

// Request Route
app.post("/request", async (req, res) => {
  const userNumber = req.session.userNumber;

  if (!userNumber) {
    res.send(`<script>alert("You need to sign in first."); window.location.href = "/signin";</script>`);
    return;
  }

  const { patientname, HospitalName, HosptialID, BloodGroup, Location } = req.body;

  try {
    const hospital = await HospUser.findOne({ hospID: HosptialID });

    if (!hospital) {
      res.send(`<script>alert("Invalid Hospital ID. Please enter a valid Hospital ID."); window.location.href = "/success";</script>`);
      return;
    }

    const newPending = new Pending({
      patientname,
      phonenumber: userNumber,
      HospitalName,
      HosptialID,
      BloodGroup,
      Location,
      Validate: 0 
    });

    await newPending.save();
    res.redirect('/success');
  } catch (error) {
    console.error("Error creating pending request:", error);
    res.status(500).send("An error occurred while creating the pending request.");
  }
});

// Route for signing out
app.get("/signout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
    }
    res.redirect('/');
  });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'signin.html'));
});

app.get("/signin", (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'signin.html'));
});

app.post("/login", async (req, res) => {
  const { number, password } = req.body;

  try {
    const loggedInUser = await User.findOne({ number: number });

    if (loggedInUser) {
      const passwordMatch = await bcrypt.compare(password, loggedInUser.password);

      if (passwordMatch) {
        req.session.userLoggedIn = true;
        req.session.userNumber = number;
        res.redirect("/success");
      } else {
        res.send(`<script>alert("Invalid phone number or password. Please try again."); window.location.href = "/";</script>`);
      }
    } else {
      res.send(`<script>alert("Invalid phone number or password. Please try again."); window.location.href = "/";</script>`);
    }
  } catch (err) {
    console.error("Error during login:", err.message);
    res.send(`<script>alert("An unexpected error occurred. Please try again later."); window.location.href = "/";</script>`);
  }
});

app.post('/donate', async (req, res) => {
  const { donorName, bloodGroup, location, phoneNumber } = req.body;
  const newDonor = new Donor({
    donorName,
    bloodGroup,
    location,
    phoneNumber
  });
  try {
    await newDonor.save();
    res.redirect('/success');
  } catch (error) {
    console.error("Error saving donor:", error);
    res.status(500).send("An error occurred while saving the donor.");
  }
});

app.get('/success', async (req, res) => {
  try {
    const userNumber = req.session.userNumber;

    if (!userNumber) {
      res.send(`<script>alert("You need to sign in first."); window.location.href = "/signin";</script>`);
      return;
    }

    // Retrieve user data from the database
    const user = await User.findOne({ number: userNumber });

    if (!user) {
      console.error("User not found:", userNumber);
      res.status(404).send("User not found.");
      return;
    }

    const pendingRequests = await Pending.find({ phonenumber: userNumber });
    const validatedPendingRequests = await Pending.find({ phonenumber: userNumber, Validate: 1 });

    let donors = [];

    if (validatedPendingRequests.length > 0) {
      const bloodGroups = validatedPendingRequests.map(request => request.BloodGroup);
      donors = await Donor.find({ bloodGroup: { $in: bloodGroups }, phoneNumber: { $ne: userNumber } });
    }

    console.log("Donors:", donors); // Debugging statement

    res.render('success', {
      user,
      pendingRequests,
      donors: JSON.stringify(donors),
      userNumber,
      showFindSection: validatedPendingRequests.length > 0
    });
  } catch (err) {
    console.error("Error fetching data:", err);
    res.status(500).send("An error occurred while fetching data. Please try again later.");
  }
});

app.post("/signup", async (req, res) => {
  const { firstName, BloodGroup, number, password } = req.body;
  if (number.length !== 10) {
    res.send(`<script>alert("Phone number must be exactly 10 digits."); window.location.href = "/signup";</script>`);
    return;
  }

  try {
    const existingUser = await User.findOne({ number: number });

    if (existingUser) {
      res.send(`<script>alert("Phone number already exists. Please choose a different phone number."); window.location.href = "/signup";</script>`);
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = new User({
        firstName, BloodGroup, number, password: hashedPassword
      });

      await newUser.save();
      res.redirect('/');
    }
  } catch (err) {
    console.error("Error during signup:", err.message);
    res.send(`<script>alert("An unexpected error occurred. Please try again later."); window.location.href = "/signup";</script>`);
  }
});

app.get("/signup", (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

app.get("/hospital", (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'HosSignin.html'));
});


app.post("/hospitals/signin", async (req, res) => {
  const { hospID, password } = req.body;

  try {
    const hospital = await HospUser.findOne({ hospID: hospID });

    if (hospital) {
      const passwordMatch = await bcrypt.compare(password, hospital.password);

      if (passwordMatch) {
        req.session.hospitalLoggedIn = true;
        req.session.hospitalLoggedInID = hospID;
        res.redirect("/hospitals/dashboard");
      } else {
        res.send(`<script>alert("Invalid hospital ID or password. Please try again."); window.location.href = "/hospitals/signin";</script>`);
      }
    } else {
      res.send(`<script>alert("Invalid hospital ID or password. Please try again."); window.location.href = "/hospitals/signin";</script>`);
    }
  } catch (err) {
    console.error("Error during hospital sign-in:", err.message);
    res.send(`<script>alert("An unexpected error occurred. Please try again later."); window.location.href = "/hospitals/signin";</script>`);
  }
});

app.get("/hospitals/signup", (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'HosSignup.html'));
});

app.post("/hospitals/signup", async (req, res) => {
  const { HospName, DocName, hospID, password } = req.body;

  try {
    const existingHospital = await HospUser.findOne({ hospID: hospID });

    if (existingHospital) {
      res.send(`<script>alert("Hospital ID already exists. Please choose a different ID."); window.location.href = "/hospitals/signup";</script>`);
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);

      const newHospital = new HospUser({
        HospName, DocName, hospID, password: hashedPassword
      });

      await newHospital.save();
      res.redirect('/hospital');
    }
  } catch (err) {
    console.error("Error during hospital signup:", err.message);
    res.send(`<script>alert("An unexpected error occurred. Please try again later."); window.location.href = "/hospitals/signup";</script>`);
  }
});

// Middleware to authenticate hospital
function authenticateHospital(req, res, next) {
  if (req.session.hospitalLoggedIn) {
    next();
  } else {
    res.redirect('/hospitals/signin');
  }
}

// Hospital dashboard route with improved error handling
app.get("/hospitals/dashboard", authenticateHospital, async (req, res) => {
  try {
    const hospital = await HospUser.findOne({ hospID: req.session.hospitalLoggedInID });

    if (!hospital) {
      res.redirect("/hospitals/signin");
      return;
    }

    const pendingRequests = await Pending.find({ HosptialID: hospital.hospID, Validate: 0 });
    const approvedRequests = await Pending.find({ HosptialID: hospital.hospID, Validate: 1 });
    const rejectedRequests = await Pending.find({ HosptialID: hospital.hospID, Validate: -1 });

    res.render('hospitalDash',
     { pendingRequests, approvedRequests, rejectedRequests 
        
     });
  } catch (err) {
    console.error("Error fetching hospital dashboard data:", err.message);
    res.status(500).send("An error occurred while fetching data.");
  }
});

// Approval and rejection routes with improved error handling
app.post("/approve", authenticateHospital, async (req, res) => {
  try {
    const requestId = req.body.requestId;
    await Pending.findByIdAndUpdate(requestId, { Validate: 1 });
    res.redirect("/hospitals/dashboard");
  } catch (err) {
    console.error("Error approving request:", err.message);
    res.status(500).send("An error occurred while approving the request.");
  }
});

app.post("/reject", authenticateHospital, async (req, res) => {
  try {
    const requestId = req.body.requestId;
    await Pending.findByIdAndUpdate(requestId, { Validate: -1 });
    res.redirect("/hospitals/dashboard");
  } catch (err) {
    console.error("Error rejecting request:", err.message);
    res.status(500).send("An error occurred while rejecting the request.");
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
