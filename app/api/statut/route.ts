import { NextResponse } from "next/server";
import { iaDisponible } from "../../../lib/claude";
import { pexelsDisponible } from "../../../lib/pexels";

// Protégé par le middleware : seul un utilisateur connecté le lit.
export function GET() {
  return NextResponse.json({ ia: iaDisponible(), broll: pexelsDisponible() });
}
