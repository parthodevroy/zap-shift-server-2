
const express = require("express");
const cors = require("cors");
require("dotenv").config();

// firebase requre

const admin = require("firebase-admin");

const serviceAccount = require("./survicekey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 3000;

// Middleware   
app.use(cors());
app.use(express.json());




// middleware chekk the user valid and authentic user want to data 
const verifyToken=async (req,res,next)=>{
  const token=req.headers.authorization
  if (!token) {
return res.status(401).send({ message: "Unauthorized access" });
    
  }
  try{
      const tokenId = token.split(" ")[1];
    const decoded=await admin.auth().verifyIdToken(tokenId)
    req.decoded_email=decoded.email
    console.log("inside of the token",decoded);
    
 next()
  }catch(err){

    return res.status(403).send({message:"unauthoraize access"})
  }
 

}

// payment chekout part
const stripe = require('stripe')(`${process.env.STRIPE_SECRET}`);

// MongoDB Connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.neniktd.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
// tracking id genarate
function generateTrackingId() {
    
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let trackingId = 'TS-'; 
    for (let i = 0; i < 8; i++) {
        trackingId += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return trackingId;
}


async function run() {
  try {
    await client.connect();
    console.log(" Connected to MongoDB");

    const db = client.db("zap-shift");
    const userCollection = db.collection("users"); 
    const ParcelsCollection = db.collection("parcels"); 
    const paymentHistory=db.collection("payment")
    const riderCollection=db.collection("rider")

    
// midleware chek the user want this data he/she is a admin 
const veryfyAdmin=async(req,res,next)=>{
  const email=req.decoded_email
  const query={email}
  const user=await userCollection.findOne(query)
  if (!user|| user.role!="admin") {
    return res.status(403).send({message:"forbiden access"});

    
  }
  next()
}

    
    // Default route
    app.get("/", (req, res) => {
      res.send("zap-shift API running ");
    });
    // user related api

    app.get("/user",async(req,res)=>{
      const serceUser=req.query.serceUser
      let query={}
      // console.log(query);
      
      if (serceUser) {
        query = {
      $or: [
        { displayName: { $regex: serceUser, $options: "i" } },
        { email: { $regex: serceUser, $options: "i" } }
      ]
    };
        
      }
      const cursor=userCollection.find(query).sort({createdAt:-1}).limit(4)
      const result=await cursor.toArray()
      res.send(result)
    })
    app.get("/user/:id", (req,res)=>{

    })
    app.get("/user/:email/role",verifyToken, async(req,res)=>{
      const email=req.params.email
      const query={ email}
      const user=await userCollection.findOne(query)
      res.send({role:user?.role || "user"})
    })
    app.post("/user",async(req,res)=>{
      const users=req.body
      users.role="user";
      users.createdAt=new Date()
      const email=users.email
      const userExist=await userCollection.findOne({email})
      if (userExist) {
        return res.send({message:"user alredy have an account,user exist"})
        
      }
      const userData=await userCollection.insertOne(users)
      res.send(userData)
    })
    app.patch("/user/:id",verifyToken,veryfyAdmin,async (req,res)=>{
      const id=req.params.id
      const roleInfo=req.body
      const query={_id:new ObjectId(id)}
      const updateDocs={
        $set:{
          role:roleInfo.role
        }
      }
      const result=await userCollection.updateOne(query,updateDocs)
      res.send(result)
    })

    // rider collection relatead api (only admnin can see)

    // rider register

    app.post("/rider",async(req,res)=>{
      const rider=req.body
      rider.status="pending";
      rider.createdAt=new Date()
      
      const userData=await riderCollection.insertOne(rider)
      res.send(userData)
    })
    // register rider get
app.get("/rider", async (req, res) => {
  const {status,district,workStatus}=req.query
  const query = {};

  if (status) {
    query.status =status;
  }
  if (district) {
    query.District=district
    
  }
  if (workStatus) {
    query.workStatus=workStatus
    
  }

  const result = await riderCollection.find(query).toArray();
  res.send(result);
});
//  rider 
app.patch("/rider/:id",verifyToken,veryfyAdmin, async (req, res) => {
   try {
    const status=req.body.status
     const id = req.params.id;
     const query= { _id: new ObjectId(id) }
    
      const updateDocs={
         $set: {
          status:status,
          workStatus:"available"
         }
        }
      const result = await riderCollection.updateOne(query,updateDocs)
      if (status === "approved") {
        const email=req.body.email
        const userQuary ={email}
        const updateUser={
          $set:{
            role:"rider"
          }
        }
        const userResult=await userCollection.updateOne(userQuary,updateUser)
        
      }
     res.send(result);
   } catch (err) {
     console.error(err);
     res.status(500).send({ message: "Failed to update  rider" });
   }
 });

// post pacel
    app.post("/parcels", async (req, res) => {
            const parcel = req.body;
            parcel.createdAt = new Date();
            parcel.trackingId = generateTrackingId(); // ✅ এখানে জেনারেট হচ্ছে
            parcel.deliveryStatus = "pending";
            parcel.paymentStatus = "unpaid";
            const result = await ParcelsCollection.insertOne(parcel);
            res.send(result);
        });
        // get parcel
    app.get("/parcels",async (req, res) => {
    try {
      
      const query ={}
      const {email,deliveryStatus}=req.query;
      if (email) {
        query.EmailAddress=email
        
      }
      if (deliveryStatus) {
        query.deliveryStatus=deliveryStatus
        
      }
      const option={sort:{createdAt:-1}}

      const result = await ParcelsCollection.find(query,option).toArray();
      res.send(result);
    } catch (err) {
      console.error(err);
      res.status(500).send({ message: "Failed to fetch user issues" });
    }
  });
// get parcel by id
  app.get("/parcels/:id",async (req, res)=>{

    try {
     const id = req.params.id;
     const result = await ParcelsCollection.findOne({
       _id: new ObjectId(id),
     });
     res.send(result);
   } catch (err) {
     console.error(err);
     res.status(500).send({ message: "Failed to delete issue" });
   }

  })
  // parcel patchh when rider assign the product and on the way
  app.patch("/parcels/:id",async(req,res)=>{
    const {riderId, riderName,riderEmail}=req.body
    const id=req.params.id
    const query={_id:new ObjectId(id)}
    const updateDocs={
      $set:{
        deliveryStatus:"rider_assign ",
        riderId:riderId,
        riderName:riderName,
        riderEmail:riderEmail
      }
    }
    const result=await ParcelsCollection.updateOne(query,updateDocs)
    // and update the same api hit rider status
    const riderQuery={_id:new ObjectId(riderId)}
    const riderUpdatedDocs={
      $set:{
        workStatus:"in_delivery"

      }
    }
    const riderResult=await riderCollection.updateOne(riderQuery,riderUpdatedDocs)
    res.send(riderResult)
  })

  // delete  parcel
  app.delete("/parcels/:id",async (req, res) => {
   try {
     const id = req.params.id;
     const result = await ParcelsCollection.deleteOne({
       _id: new ObjectId(id),
     });
     res.send(result);
   } catch (err) {
     console.error(err);
     res.status(500).send({ message: "Failed to delete issue" });
   }
 });

//  payment chekout sesssion
app.post('/create-checkout-session', async (req, res) => {


  const paymentInfo=req.body;
  // console.log(paymentInfo);
  
  const amount=parseInt(paymentInfo.cost)*100

  const session = await stripe.checkout.sessions.create({
    line_items: [
      {
        // Provide the exact Price ID (for example, price_1234) of the product you want to sell
       price_data:{
        unit_amount:amount,
        currency:"usd",
        product_data:{
          name:`plese pay for ${paymentInfo.parcelName}`
        }
       },
        quantity: 1,
      },
    ],
    metadata:{
      parcelId:paymentInfo.parcelId,
      parcelName:paymentInfo.parcelName
    },
    customer_email:paymentInfo.senderEmail,
    mode: 'payment',
    
    success_url: `${process.env.SITE_URL}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:`${process.env.SITE_URL}/dashboard/payment-cancel?session_id={CHECKOUT_SESSION_ID}`,

  });

  res.send({ url: session.url });
});



app.post('/payment/verify', async (req, res) => {
    const { sessionId } = req.body;

    if (!sessionId) {
        return res.status(400).send({ verified: false, message: "Session ID missing." });
    }

    try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        const transactionId = session.payment_intent; // ⭐ Unified transaction ID

        // 🔥 Prevent double save
        const exists = await paymentHistory.findOne({ transactionId });

        if (exists) {
            return res.send({
                verified: true,
                message: "Payment already recorded",
                trackingId: exists.trackingId
            });
        }

        if (session.payment_status === 'paid' && session.metadata?.parcelId) {
            const parcelId = session.metadata.parcelId;

            const currentParcel = await ParcelsCollection.findOne({ _id: new ObjectId(parcelId) });

            if (!currentParcel) {
                return res.status(404).send({ verified: false, message: "Parcel not found." });
            }

            const trackingId = currentParcel.trackingId;

            // ✔ parcel update
            await ParcelsCollection.updateOne(
                { _id: new ObjectId(parcelId) },
                { $set: { 
                  paymentStatus: 'paid',
                  deliveryStatus:"pending-pickup",
                   transactionId 
                  } }
            );

            // ✔ Save payment history once
            await paymentHistory.insertOne({
                amount: session.amount_total / 100,
                currency: session.currency,
                customerEmail: session.customer_details?.email,
                parcelId,
                parcelName: session.metadata.parcelName,
                trackingId,
                transactionId,
                paymentStatus: 'paid',
                paidAt: new Date(),
            });

            return res.send({
                verified: true,
                message: "Payment verified & saved.",
                trackingId
            });
        }

        return res.send({ verified: false, message: "Payment not paid." });

    } catch (error) {
        console.error("Verify Error:", error);
        res.status(500).send({ verified: false, message: error.message });
    }
});
// payment history api
app.get("/payment",verifyToken, async (req, res) => {
    try {
        const email = req.query.email;
        const query = {};
        // console.log(req.headers);
        

        if (email) {
            query.customerEmail = email;
            if (email!==req.decoded_email) {
              return res.status(403).send({message:"forbided"})
              
            }
        }

        const cursor = paymentHistory.find(query).sort({ amount: -1, paidAt: -1 }).limit(8) ;
        const result = await cursor.toArray();

        res.send(result);
    } catch (error) {
        console.error("Payment fetch error:", error);
        res.status(500).send({ message: "Failed to fetch payment history" });
    }
});




  app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
}

run().catch(console.dir);
    

// issu details 


// app.get("/issues/:id",verifyToken,async (req, res) => {
//   try {
//     const id = req.params.id;
//     const issue = await issuesCollection.findOne({ _id: new ObjectId(id) });
//     if (!issue) return res.status(404).send({ message: "Issue not found" });

//     // console.log(" Issue fetched by:", req.user.email);
//     res.send(issue);
//   } catch (err) {
//     console.error(err);
//     res.status(500).send({ message: "Server error" });
//   }
// });

    
// app.post("/userissues", verifyToken, async (req, res) => {
//   try {
//     const issue = req.body;

   
//     const userIssue = {
//       ...issue,
//       email: req.user.email,
//       createdAt: new Date(),
//       status: "ongoing",
//     };

    
//     const userResult = await userIssuesCollection.insertOne(userIssue);

   
//     const publicIssue = {
//       ...issue,
//       createdAt: new Date(),
//       status: "ongoing",
//       userIssueId: userResult.insertedId, 
//     };

    
//     const publicResult = await issuesCollection.insertOne(publicIssue);

//     res.send({
//       success: true,
//       message: "Issue added successfully",
//       userIssueId: userResult.insertedId,
//       publicIssueId: publicResult.insertedId,
//     });
//   } catch (err) {
//     console.error("Error adding issue:", err);
//     res.status(500).send({ message: "Failed to add issue" });
//   }
// });

//     //Get (My Issues)
//     app.get("/userissues", verifyToken,async (req, res) => {
//       try {
//         const email = req.query.email;
//         const query = email ? { email } : {};
//         const result = await userIssuesCollection.find(query).toArray();
//         res.send(result);
//       } catch (err) {
//         console.error(err);
//         res.status(500).send({ message: "Failed to fetch user issues" });
//       }
//     });

//     // Edit 
//     app.put("/userissues/:id",verifyToken, async (req, res) => {
//       try {
//         const id = req.params.id;
//         const updatedIssue = req.body;
//         const result = await userIssuesCollection.updateOne(
//           { _id: new ObjectId(id) },
//           { $set: updatedIssue }
//         );
//         res.send(result);
//       } catch (err) {
//         console.error(err);
//         res.status(500).send({ message: "Failed to update issue" });
//       }
//     });

//     // Delete 
//     app.delete("/userissues/:id",async (req, res) => {
//       try {
//         const id = req.params.id;
//         const result = await userIssuesCollection.deleteOne({
//           _id: new ObjectId(id),
//         });
//         res.send(result);
//       } catch (err) {
//         console.error(err);
//         res.status(500).send({ message: "Failed to delete issue" });
//       }
//     });

//     //  Contributes
//     app.post("/contribute",verifyToken,async (req, res) => {
//       const contribution = req.body;
//       const result = await contributionsCollection.insertOne(contribution);
//       res.send(result);
//     });


//     // all contributors information
// app.get("/contributions/:issueId", verifyToken, async (req, res) => {
//   try {
//     const issueId = req.params.issueId;
//     const result = await contributionsCollection.find({ issueId }).toArray();
//     res.send(result);
//   } catch (err) {
//     console.error(err);
//     res.status(500).send({ message: "Failed to fetch contributions" });
//   }
// });


//     app.get("/mycontributions/:email",verifyToken,async (req, res) => {
//       const email = req.params.email;
//       const result = await contributionsCollection.find({ userEmail: email }).toArray();
//       res.send(result);
//     });

//     app.put("/mycontributions/:id",async (req, res) => {
//       const id = req.params.id;
//       const { amount } = req.body;
//       const result = await contributionsCollection.updateOne(
//         { _id: new ObjectId(id) },
//         { $set: { amount } }
//       );
//       res.send(result);
//     });

//     app.delete("/mycontributions/:id",verifyToken,async (req, res) => {
//       const id = req.params.id;
//       const result = await contributionsCollection.deleteOne({ _id: new ObjectId(id) });
//       res.send(result);
//     });

  