import Razorpay from "razorpay";
import crypto from "crypto";
import { logger } from "../utils/logger.js";

export class PaymentService {
    private razorpay: Razorpay;

    constructor() {
        if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
            logger.warn("Razorpay credentials missing");
        }

        this.razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID || "",
            key_secret: process.env.RAZORPAY_KEY_SECRET || "",
        });
    }

    async createOrder(amount: number, currency = "INR"): Promise<any> {
        try {
            const options = {
                amount: amount * 100, // Amount in paise
                currency,
                receipt: `receipt_${Date.now()}`,
            };

            const order = await this.razorpay.orders.create(options);
            logger.info("Razorpay order created", { orderId: order.id });
            return order;
        } catch (error) {
            logger.error("Failed to create Razorpay order", error);
            throw error;
        }
    }

    verifySignature(orderId: string, paymentId: string, signature: string): boolean {
        const body = orderId + "|" + paymentId;
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
            .update(body.toString())
            .digest("hex");

        const isValid = expectedSignature === signature;

        if (!isValid) {
            logger.warn("Invalid payment signature", { orderId, paymentId });
        }

        return isValid;
    }
}

export const paymentService = new PaymentService();
