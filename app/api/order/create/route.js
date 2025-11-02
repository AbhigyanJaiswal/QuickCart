import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import Product from "@/models/product";
import { inngest } from "@/config/inngest";
import User from "@/models/User";
import connectDB from "@/config/db";

export async function POST(request) {
  try {
    await connectDB();

    // ✅ Get the logged-in Clerk user ID
    const { userId } = getAuth(request);

    // ✅ Parse request body
    const { address, items } = await request.json();

    // ✅ Basic validation
    if (!userId || !address || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({
        success: false,
        message: "Invalid data provided",
      });
    }

    // ✅ Fetch all product prices and calculate subtotal
    const productTotals = await Promise.all(
      items.map(async (item) => {
        const product = await Product.findById(item.product);
        if (!product) {
          throw new Error(`Product not found: ${item.product}`);
        }
        return product.offerPrice * item.quantity;
      })
    );

    const subtotal = productTotals.reduce((sum, val) => sum + val, 0);
    const amount = subtotal + Math.floor(subtotal * 0.02); // add 2% fee

    // ✅ Send event to Inngest for order processing
    await inngest.send({
      name: "order/created",
      data: {
        userId, // Clerk ID
        address,
        items,
        amount,
        date: Date.now(),
      },
    });

    // ✅ Clear user's cart (using clerkId, not Mongo _id)
    const user = await User.findOne({ clerkId: userId }); // 🔥 fixed line

    if (!user) {
      return NextResponse.json({
        success: false,
        message: "User not found in database",
      });
    }

    user.cartItems = [];
    await user.save();

    return NextResponse.json({
      success: true,
      message: "Order placed successfully",
    });
  } catch (error) {
    console.error("❌ Error in /api/order/create:", error);
    return NextResponse.json({
      success: false,
      message: error.message,
    });
  }
}
