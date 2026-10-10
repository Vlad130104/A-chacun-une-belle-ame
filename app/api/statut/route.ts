import { NextResponse } from "next/server";
import { iaDisponible } from "../../../lib/claude";

// Protégé par le middleware : seul un utilisateur connecté le lit.
export function GET() {
  return NextResponse.json({ ia: iaDisponible() });
}
