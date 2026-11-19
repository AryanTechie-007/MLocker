import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { RegisterUserSchema } from "@/lib/domain/validation";
import {
  badRequestResponse,
  validationErrorResponse,
  internalErrorResponse,
} from "@/lib/api-response";

export async function POST(req: Request) {
  try {
    const rawBody = await req.json().catch(() => null);
    const parseResult = RegisterUserSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return validationErrorResponse(parseResult.error);
    }

    const { name, email, password } = parseResult.data;
    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return badRequestResponse("User already exists with this email", undefined, "USER_EXISTS");
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name: name ? name.trim() : null,
        email: normalizedEmail,
        passwordHash,
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    console.error("Registration error:", error);
    return internalErrorResponse("An unexpected error occurred during registration");
  }
}
