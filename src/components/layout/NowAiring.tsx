import { io } from "next/cache";

import { animeDayRange, currentAnimeDate } from "@/domain/time";
import { getAiringWindow } from "@/server/queries/seasons";

import { NowAiringBanner } from "./NowAiringBanner";

/** Today's anime airings (from two hours before 05:00) handed to the client, which picks what is on air now. */
export async function NowAiring() {
  await io(); // "today" is per request; never part of a prerendered shell
  const day = animeDayRange(currentAnimeDate());
  const airings = await getAiringWindow(new Date(day.start.getTime() - 2 * 60 * 60 * 1000).toISOString(), day.end.toISOString()).catch(() => []);
  if (airings.length === 0) return null;
  return <NowAiringBanner airings={airings} dayEnd={day.end.toISOString()} />;
}
