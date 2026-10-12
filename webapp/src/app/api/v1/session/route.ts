import { NextRequest, NextResponse } from "next/server";
import { authenticatedUser, database, login, logout } from "@/lib/server/database";
import { SESSION_COOKIE, NO_STORE, apiError, bodyJson, checkWriteRequest } from "@/lib/server/request";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    database();
    return Response.json({ user: authenticatedUser(request.cookies.get(SESSION_COOKIE)?.value) }, { headers: NO_STORE });
  }
  catch (error) { return apiError(error); }
}
export async function POST(request: NextRequest) {
  try {
    checkWriteRequest(request);
    const body = await bodyJson(request, 4096);
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (username.length > 100 || password.length > 200) return Response.json({ error: "Username atau password salah" }, { status: 401, headers: NO_STORE });
    const account = login(username, password, request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "local");
    const response = NextResponse.json({ user: account.user }, { headers: NO_STORE });
    const secure = request.headers.get("x-forwarded-proto") === "https" || request.nextUrl.protocol === "https:";
    response.cookies.set(SESSION_COOKIE, account.token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 30 * 86400 });
    return response;
  } catch (error) { return apiError(error); }
}
export async function DELETE(request: NextRequest) {
  try {
    checkWriteRequest(request); logout(request.cookies.get(SESSION_COOKIE)?.value);
    const response = NextResponse.json({ user: null }, { headers: NO_STORE });
    response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0, sameSite: "lax" });
    return response;
  } catch (error) { return apiError(error); }
}
