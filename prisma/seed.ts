import { PrismaClient } from "@prisma/client";

import {
  airings,
  channels,
  companies,
  people,
  regions,
  sequelRelations,
  slots,
  titleCompanies,
  titleStaff,
  titles
} from "../src/data/catalog";

const prisma = new PrismaClient();

async function main() {
  await prisma.sourceRecord.deleteMany();
  await prisma.airing.deleteMany();
  await prisma.sequelRelation.deleteMany();
  await prisma.titleStaff.deleteMany();
  await prisma.titleCompany.deleteMany();
  await prisma.slot.deleteMany();
  await prisma.channel.deleteMany();
  await prisma.region.deleteMany();
  await prisma.person.deleteMany();
  await prisma.company.deleteMany();
  await prisma.title.deleteMany();

  await prisma.region.createMany({ data: regions });
  await prisma.channel.createMany({ data: channels });
  await prisma.slot.createMany({
    data: slots.map((slot) => ({
      ...slot,
      startDate: new Date(slot.startDate),
      endDate: slot.endDate ? new Date(slot.endDate) : null
    }))
  });
  await prisma.company.createMany({ data: companies });
  await prisma.person.createMany({ data: people });
  await prisma.title.createMany({
    data: titles.map((title) => ({
      ...title,
      lastUpdatedAt: new Date(title.lastUpdatedAt)
    }))
  });
  await prisma.titleCompany.createMany({ data: titleCompanies });
  await prisma.titleStaff.createMany({ data: titleStaff });
  await prisma.sequelRelation.createMany({ data: sequelRelations });
  await prisma.airing.createMany({
    data: airings.map((airing) => ({
      ...airing,
      broadcastStartAt: new Date(airing.broadcastStartAt),
      broadcastEndAt: new Date(airing.broadcastEndAt)
    }))
  });
}

main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
