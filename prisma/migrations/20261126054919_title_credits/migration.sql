-- AlterTable
ALTER TABLE "Slot" ADD COLUMN     "creditProfile" JSONB;

-- AlterTable
ALTER TABLE "Title" ADD COLUMN     "creditEvidence" JSONB,
ADD COLUMN     "publishers" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "studios" TEXT[] DEFAULT ARRAY[]::TEXT[];
