import { Router } from "express";
import { paymentService } from "../services/payment.js";
import { logger } from "../utils/logger.js";
import { prisma } from "../utils/prisma.js";

const router = Router();

// Create order
router.post("/order", async (req, res) => {
    try {
        const { amount } = req.body;
        if (!amount) {
            return res.status(400).json({ error: "Amount is required" });
        }

        const order = await paymentService.createOrder(amount);
        res.json(order);
    } catch (error) {
        logger.error("Error creating order", error);
        res.status(500).json({ error: "Failed to create order" });
    }
});

// Verify payment
router.post("/verify", async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;

        if (!amount) {
            return res.status(400).json({ error: "Amount is required" });
        }

        const isValid = paymentService.verifySignature(
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        );

        if (isValid) {
            // Fetch payment details to get the phone number (contact)
            let phone = null;
            try {
                const paymentDetails = await paymentService.getPaymentDetails(razorpay_payment_id);
                phone = paymentDetails.contact;
                logger.info("Fetched phone from Razorpay", { phone });
            } catch (fetchError) {
                logger.error("Could not fetch phone from Razorpay", fetchError);
            }

            // Store payment in DB
            try {
                await prisma.payment.create({
                    data: {
                        paymentId: razorpay_payment_id,
                        orderId: razorpay_order_id,
                        signature: razorpay_signature,
                        amount: amount, // Store actual amount
                        currency: "INR",
                        status: "success",
                        phoneNumber: phone,
                    }
                });
                logger.info("Payment recorded in DB", { paymentId: razorpay_payment_id });
            } catch (dbError) {
                logger.error("Failed to record payment in DB", dbError);
            }

            // Generate payment token including the amount
            const paymentToken = Buffer.from(JSON.stringify({
                paymentId: razorpay_payment_id,
                orderId: razorpay_order_id,
                amount: amount,
                timestamp: Date.now()
            })).toString("base64");

            res.json({ success: true, paymentToken });
        } else {
            res.status(400).json({ success: false, error: "Invalid signature" });
        }
    } catch (error) {
        logger.error("Error verifying payment", error);
        res.status(500).json({ error: "Verification failed" });
    }
});

export const paymentRouter = router;
