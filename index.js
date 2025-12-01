
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
    // console.log("inside of the token",decoded);
    
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
    const trakingCollection=db.collection("trakingId")

    
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
// rider secure data use valid token then access
const veryfyRider=async(req,res,next)=>{
  const email=req.decoded_email
  const query={email}
  const user=await userCollection.findOne(query)
  if (!user|| user.role!="rider") {
    return res.status(403).send({message:"forbiden access"});

    
  }
  next()
}
const TrakingLog=async(trackingId,status)=>{
  const log={
    trackingId,
    status,
    details:status.split('_').join(' '),
    createdAt:new Date()
  }
  const result=await trakingCollection.insertOne(log)
  return result

}
    
    // Default route
    app.get("/", (req, res) => {
      res.send("zap-shift API running ");
    });
    // user related api
// get all user my who is register my website 
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
    
    // get user base his role by this website 
    app.get("/user/:email/role",verifyToken, async(req,res)=>{
      const email=req.params.email
      const query={ email}
      const user=await userCollection.findOne(query)
      res.send({role:user?.role || "user"})
    })
    // when user register zapshift page and save his database do simple user
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
    // patch /updated user role user to admin and admin to simple user
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

    // rider register/form filap zap shoft would like took part rider in zapshift

    app.post("/rider",async(req,res)=>{
      const rider=req.body
      rider.status="pending";
      rider.createdAt=new Date()
      
      const userData=await riderCollection.insertOne(rider)
      res.send(userData)
    })
    // register people  get api those people
    //  want feile like rider and the alredy registed and subn=mit rider frome
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
//  rider status updaated 
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

//  trakings id realated api 
app.get("/tracking/:trackingId", async (req, res) => {
    const trackingId = req.params.trackingId;

    const query = { trackingId };

    const result = await trakingCollection
        .find(query)
        .sort({ createdAt: -1 }) // latest first
        .toArray();

    res.send(result);
});



// post pacel **note:jdi traking id realated kno problem hy tahole ai khane r payment api te hbe 
// karon taking id genared double hye jete pare parcel created r parcel er payment hower por
    app.post("/parcels", async (req, res) => {
            const parcel = req.body;

            parcel.createdAt = new Date();

            parcel.trackingId = generateTrackingId(); 
            parcel.deliveryStatus = "pending";
            parcel.paymentStatus = "unpaid";
          TrakingLog(parcel.trackingId,'parcel_created')
            const result = await ParcelsCollection.insertOne(parcel);
            res.send(result);
        });   
        // get which parcel those parcel people want to send another place  
  //   app.get("/parcels",async (req, res) => {
  //   try {
      
  //     const query ={}
  //     const {email,deliveryStatus,riderEmail}=req.query;
  //     if (email) {
  //       query.EmailAddress=email
        
  //     }
  //     if (riderEmail) {
  //       query.riderEmail=riderEmail
        
  //     }
  //     if (deliveryStatus!=='parcel_deliverd') {
       
  //       query.deliveryStatus={$nin:['parcel_deliverd']}
        
  //     }else{
  //       query.deliveryStatus=deliveryStatus
  //     }
    
  //     const option={sort:{createdAt:-1}}

  //     const result = await ParcelsCollection.find(query,option).toArray();
  //     res.send(result);
  //   } catch (err) {
  //     console.error(err);
  //     res.status(500).send({ message: "Failed to fetch user issues" });
  //   }
  // });

  // aggrigate papeline (advance topic)
  app.get("/parcels/delivery-status/status",async(req,res)=>{
    const papeline=[
      {
        $group:{
          _id:"$deliveryStatus",
          count:{$sum:1}
        }
      }
    ]
    const result=await ParcelsCollection.aggregate(papeline).toArray();
    res.send(result)
  })
  app.get("/parcels", async (req, res) => {
  try {
    const query = {};
    const { email, deliveryStatus, riderEmail } = req.query;

    if (email) query.EmailAddress = email; // sender email
    if (riderEmail) query.riderEmail = riderEmail; // rider only assigned
    if (deliveryStatus) {
      if (deliveryStatus !== "parcel_deliverd") {
        query.deliveryStatus = { $nin: ["parcel_deliverd"] };
      } else {
        query.deliveryStatus = deliveryStatus;
      }
    }

    const options = { sort: { createdAt: -1 } };
    const result = await ParcelsCollection.find(query, options).toArray();
    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to fetch parcels" });
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
  // parcel patch when admin  assign the product and send request to rider  confirm
  app.patch("/parcels/:id",async(req,res)=>{
    const {riderId, riderName,riderEmail,trackingId}=req.body
    const id=req.params.id
    const query={_id:new ObjectId(id)}
    const updateDocs={
      $set:{
        deliveryStatus:"rider_assign".trim(),
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
    TrakingLog(trackingId,'rider_assign')
    res.send(riderResult)
  })
// again patch parcel when the rider confirm the order (accepeted/reject) 
app.patch("/parcels/:id/status",async (req,res)=>{
  const {deliveryStatus,riderId,trackingId}=req.body
  const id=req.params.id
  const query={_id:new ObjectId(id)}
const UpdatedDocs={
  $set:{
    deliveryStatus:deliveryStatus
  }
}
if (deliveryStatus==='parcel_deliverd') {
  // and update the same api hit rider status
    const riderQuery={_id:new ObjectId(riderId)}
    const riderUpdatedDocs={
      $set:{
        workStatus:"available"

      }
    }
    const riderResult=await riderCollection.updateOne(riderQuery,riderUpdatedDocs)
    res.send(riderResult)
  
}
const result=await ParcelsCollection.updateOne(query,UpdatedDocs)
TrakingLog(trackingId,deliveryStatus)
res.send(result)
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


// payment veryfy and created session id 
app.post('/payment/verify', async (req, res) => {
    const { sessionId } = req.body;

    if (!sessionId) {
        return res.status(400).send({ verified: false, message: "Session ID missing." });
    }

    try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        const transactionId = session.payment_intent; 
       
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
             TrakingLog(trackingId,'parcel_paid')

            // parcel update
            await ParcelsCollection.updateOne(
                { _id: new ObjectId(parcelId) },
                { $set: { 
                  paymentStatus: 'paid',
                  deliveryStatus:"parcel_paid",
                   transactionId 
                  } }
            );

            //  Save payment history once
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
        console.log(req.headers);
        
        

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
    
