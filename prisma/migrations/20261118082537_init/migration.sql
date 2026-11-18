-- CreateEnum
CREATE TYPE "Medium" AS ENUM ('TERRESTRIAL', 'BS', 'CS', 'INTERNET', 'RADIO', 'OTHER');

-- CreateEnum
CREATE TYPE "Area" AS ENUM ('NATIONWIDE', 'KANTO', 'KANSAI', 'OTHER');

-- CreateEnum
CREATE TYPE "RerunBasis" AS ENUM ('FLAG', 'AGE', 'MANUAL', 'NONE');

-- CreateEnum
CREATE TYPE "RevisionType" AS ENUM ('CREATED', 'RESCHEDULED', 'FLAGS_CHANGED', 'DELETED', 'RESTORED', 'UPDATED');

-- CreateEnum
CREATE TYPE "SlotKind" AS ENUM ('OFFICIAL', 'SOURCE_LABEL', 'INFERRED');

-- CreateEnum
CREATE TYPE "MembershipMethod" AS ENUM ('SOURCE_COMMENT', 'TIME_POSITION', 'MANUAL');

-- CreateEnum
CREATE TYPE "Confidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED');

-- CreateTable
CREATE TABLE "Channel" (
    "id" SERIAL NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "medium" "Medium",
    "area" "Area",
    "network" TEXT,
    "sourceGroupId" TEXT,
    "sourceGroupName" TEXT,
    "url" TEXT,
    "isTracked" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 1000,
    "sourceUpdatedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Title" (
    "id" SERIAL NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "yomi" TEXT,
    "nameEn" TEXT,
    "sourceCategory" INTEGER,
    "firstYear" INTEGER,
    "firstMonth" INTEGER,
    "firstEndYear" INTEGER,
    "firstEndMonth" INTEGER,
    "firstChannelText" TEXT,
    "officialUrl" TEXT,
    "slotLabels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "slotEvidence" JSONB,
    "seriesKey" TEXT,
    "sourceUpdatedAt" TIMESTAMPTZ(3),
    "detailsFetchedAt" TIMESTAMPTZ(3),
    "contentHash" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Title_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Broadcast" (
    "id" SERIAL NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "titleId" INTEGER NOT NULL,
    "channelId" INTEGER NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "startOffsetSeconds" INTEGER,
    "animeDate" DATE NOT NULL,
    "animeWeekday" INTEGER NOT NULL,
    "animeStartMinute" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "episodeNumber" INTEGER,
    "episodeLabel" TEXT,
    "subtitle" TEXT,
    "comment" TEXT,
    "flagNote" BOOLEAN NOT NULL DEFAULT false,
    "flagNew" BOOLEAN NOT NULL DEFAULT false,
    "flagFinal" BOOLEAN NOT NULL DEFAULT false,
    "flagRerun" BOOLEAN NOT NULL DEFAULT false,
    "isRerun" BOOLEAN NOT NULL DEFAULT false,
    "rerunBasis" "RerunBasis" NOT NULL DEFAULT 'NONE',
    "warn" INTEGER,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "sourceRevision" INTEGER,
    "sourceUpdatedAt" TIMESTAMPTZ(3),
    "missingSince" TIMESTAMPTZ(3),
    "contentHash" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BroadcastRevision" (
    "id" SERIAL NOT NULL,
    "broadcastId" INTEGER NOT NULL,
    "importRunId" INTEGER,
    "observedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changeType" "RevisionType" NOT NULL,
    "before" JSONB,
    "after" JSONB NOT NULL,

    CONSTRAINT "BroadcastRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Slot" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "SlotKind" NOT NULL,
    "description" TEXT,
    "evidenceUrl" TEXT,
    "ruleVersion" TEXT NOT NULL,
    "homeChannelId" INTEGER,
    "firstAnimeDate" DATE,
    "lastAnimeDate" DATE,
    "titleCount" INTEGER NOT NULL DEFAULT 0,
    "seasonCount" INTEGER NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Slot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlotMembership" (
    "id" SERIAL NOT NULL,
    "slotId" INTEGER NOT NULL,
    "titleId" INTEGER NOT NULL,
    "channelId" INTEGER,
    "method" "MembershipMethod" NOT NULL,
    "confidence" "Confidence" NOT NULL,
    "evidence" TEXT,
    "seasonOrdinal" INTEGER,
    "animeWeekday" INTEGER,
    "animeStartMinute" INTEGER,
    "firstStartAt" TIMESTAMPTZ(3),
    "lastStartAt" TIMESTAMPTZ(3),
    "broadcastCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SlotMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlotSeason" (
    "id" SERIAL NOT NULL,
    "slotId" INTEGER NOT NULL,
    "seasonOrdinal" INTEGER NOT NULL,
    "channelId" INTEGER NOT NULL,
    "animeWeekday" INTEGER NOT NULL,
    "animeStartMinute" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "titleCount" INTEGER NOT NULL,

    CONSTRAINT "SlotSeason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRun" (
    "id" SERIAL NOT NULL,
    "command" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),
    "rangeStart" TIMESTAMPTZ(3),
    "rangeEnd" TIMESTAMPTZ(3),
    "params" JSONB,
    "stats" JSONB,
    "error" TEXT,
    "requestCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FetchLog" (
    "id" SERIAL NOT NULL,
    "importRunId" INTEGER,
    "requestKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "httpStatus" INTEGER,
    "resultCode" INTEGER,
    "rowCount" INTEGER,
    "durationMs" INTEGER NOT NULL,
    "bytes" INTEGER,
    "payloadHash" TEXT,
    "fromCache" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FetchLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawPayload" (
    "hash" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "body" BYTEA NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawPayload_pkey" PRIMARY KEY ("hash")
);

-- CreateTable
CREATE TABLE "CoverageWindow" (
    "id" SERIAL NOT NULL,
    "source" TEXT NOT NULL,
    "rangeStart" TIMESTAMPTZ(3) NOT NULL,
    "rangeEnd" TIMESTAMPTZ(3) NOT NULL,
    "channelIds" TEXT[],
    "rowCount" INTEGER NOT NULL,
    "completedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importRunId" INTEGER,

    CONSTRAINT "CoverageWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncCursor" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SyncCursor_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Channel_slug_key" ON "Channel"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_source_externalId_key" ON "Channel"("source", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Title_slug_key" ON "Title"("slug");

-- CreateIndex
CREATE INDEX "Title_seriesKey_idx" ON "Title"("seriesKey");

-- CreateIndex
CREATE INDEX "Title_name_idx" ON "Title"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Title_source_externalId_key" ON "Title"("source", "externalId");

-- CreateIndex
CREATE INDEX "Broadcast_startAt_idx" ON "Broadcast"("startAt");

-- CreateIndex
CREATE INDEX "Broadcast_channelId_startAt_idx" ON "Broadcast"("channelId", "startAt");

-- CreateIndex
CREATE INDEX "Broadcast_titleId_startAt_idx" ON "Broadcast"("titleId", "startAt");

-- CreateIndex
CREATE INDEX "Broadcast_animeDate_idx" ON "Broadcast"("animeDate");

-- CreateIndex
CREATE UNIQUE INDEX "Broadcast_source_externalId_key" ON "Broadcast"("source", "externalId");

-- CreateIndex
CREATE INDEX "BroadcastRevision_broadcastId_observedAt_idx" ON "BroadcastRevision"("broadcastId", "observedAt");

-- CreateIndex
CREATE INDEX "BroadcastRevision_observedAt_idx" ON "BroadcastRevision"("observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Slot_slug_key" ON "Slot"("slug");

-- CreateIndex
CREATE INDEX "Slot_kind_idx" ON "Slot"("kind");

-- CreateIndex
CREATE INDEX "SlotMembership_titleId_idx" ON "SlotMembership"("titleId");

-- CreateIndex
CREATE UNIQUE INDEX "SlotMembership_slotId_titleId_key" ON "SlotMembership"("slotId", "titleId");

-- CreateIndex
CREATE UNIQUE INDEX "SlotSeason_slotId_seasonOrdinal_key" ON "SlotSeason"("slotId", "seasonOrdinal");

-- CreateIndex
CREATE INDEX "ImportRun_startedAt_idx" ON "ImportRun"("startedAt");

-- CreateIndex
CREATE INDEX "FetchLog_requestKey_startedAt_idx" ON "FetchLog"("requestKey", "startedAt");

-- CreateIndex
CREATE INDEX "FetchLog_startedAt_idx" ON "FetchLog"("startedAt");

-- CreateIndex
CREATE INDEX "CoverageWindow_rangeStart_rangeEnd_idx" ON "CoverageWindow"("rangeStart", "rangeEnd");

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastRevision" ADD CONSTRAINT "BroadcastRevision_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "Broadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastRevision" ADD CONSTRAINT "BroadcastRevision_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "ImportRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_homeChannelId_fkey" FOREIGN KEY ("homeChannelId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotMembership" ADD CONSTRAINT "SlotMembership_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "Slot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotMembership" ADD CONSTRAINT "SlotMembership_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotMembership" ADD CONSTRAINT "SlotMembership_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotSeason" ADD CONSTRAINT "SlotSeason_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "Slot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotSeason" ADD CONSTRAINT "SlotSeason_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FetchLog" ADD CONSTRAINT "FetchLog_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "ImportRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageWindow" ADD CONSTRAINT "CoverageWindow_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "ImportRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
