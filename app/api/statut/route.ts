import { NextResponse } from "next/server";
import { iaDisponible } from "../../../lib/claude";
import { elevenDisponible } from "../../../lib/elevenlabs";
import { pexelsDisponible } from "../../../lib/pexels";
import { pixabayDisponible } from "../../../lib/pixabay";

// Protégé par le middleware : seul un utilisateur connecté le lit. Indique quels services sont branchés (jamais les clés).
export function GET() {
  const pexels = pexelsDisponible(), pixabay = pixabayDisponible();
  return NextResponse.json({ ia: iaDisponible(), broll: pexels || pixabay, pexels, pixabay, eleven: elevenDisponible() });
}
