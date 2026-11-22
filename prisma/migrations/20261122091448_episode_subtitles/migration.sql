-- AlterTable
ALTER TABLE "Title" ADD COLUMN     "subtitlesFetchedAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "TitleSubtitle" (
    "id" SERIAL NOT NULL,
    "titleId" INTEGER NOT NULL,
    "episodeNumber" INTEGER NOT NULL,
    "subtitle" TEXT NOT NULL,

    CONSTRAINT "TitleSubtitle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TitleSubtitle_titleId_episodeNumber_key" ON "TitleSubtitle"("titleId", "episodeNumber");

-- AddForeignKey
ALTER TABLE "TitleSubtitle" ADD CONSTRAINT "TitleSubtitle_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE CASCADE ON UPDATE CASCADE;
