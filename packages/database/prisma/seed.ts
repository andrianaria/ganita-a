import { PrismaClient, DataSourceStatus, DataSourceType, HealthStatus, IssueSeverity, IssueStatus, HealthIssueType } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";

const prisma = new PrismaClient();

const outlets = [
  { name: "Demo Outlet A", code: "DEMO_A", baseSales: 10000000, hpp: 36, score: 60, status: HealthStatus.ATTENTION },
  { name: "Demo Outlet B", code: "DEMO_B", baseSales: 8000000, hpp: 42, score: 45, status: HealthStatus.CRITICAL },
  { name: "Demo Outlet C", code: "DEMO_C", baseSales: 12000000, hpp: 31, score: 80, status: HealthStatus.HEALTHY },
  { name: "Demo Outlet D", code: "DEMO_D", baseSales: 9000000, hpp: 37, score: 70, status: HealthStatus.ATTENTION },
  { name: "Demo Outlet E", code: "DEMO_E", baseSales: 11000000, hpp: 33, score: 78, status: HealthStatus.HEALTHY }
];

function hashPassword(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function dateOnly(daysAgo: number) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date;
}

async function main() {
  const ownerPassword = process.env.DEMO_OWNER_PASSWORD;
  const adminPassword = process.env.DEMO_ADMIN_PASSWORD;
  if (!ownerPassword || !adminPassword) {
    throw new Error("Set DEMO_OWNER_PASSWORD and DEMO_ADMIN_PASSWORD privately before seeding. No default credentials are provided.");
  }
  const organization = await prisma.organization.upsert({
    where: { slug: "example-demo" },
    update: {},
    create: {
      name: "Example Demo Company",
      slug: "example-demo",
      timezone: "Asia/Jakarta",
      currency: "IDR"
    }
  });

  const user = await prisma.user.upsert({
    where: { email: "owner@example.com" },
    update: {},
    create: {
      email: "owner@example.com",
      name: "Demo Owner",
      passwordHash: hashPassword(ownerPassword)
    }
  });

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: { name: "Demo Administrator", passwordHash: hashPassword(adminPassword) },
    create: {
      email: "admin@example.com",
      name: "Demo Administrator",
      passwordHash: hashPassword(adminPassword)
    }
  });

  await prisma.organizationUser.upsert({
    where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
    update: {},
    create: { organizationId: organization.id, userId: user.id, role: "OWNER" }
  });

  await prisma.organizationUser.upsert({
    where: { organizationId_userId: { organizationId: organization.id, userId: adminUser.id } },
    update: { role: "OWNER" },
    create: { organizationId: organization.id, userId: adminUser.id, role: "OWNER" }
  });

  const brand = await prisma.brand.upsert({
    where: { organizationId_slug: { organizationId: organization.id, slug: "demo-brand" } },
    update: {},
    create: { organizationId: organization.id, name: "Demo Brand", slug: "demo-brand" }
  });

  const source = await prisma.dataSource.create({
    data: {
      organizationId: organization.id,
      type: DataSourceType.CSV,
      name: "Synthetic CSV Demo Data",
      status: DataSourceStatus.CONNECTED,
      connectionSecretRef: "demo-data-no-secret"
    }
  });

  for (const seedOutlet of outlets) {
    const outlet = await prisma.outlet.upsert({
      where: { organizationId_code: { organizationId: organization.id, code: seedOutlet.code } },
      update: {},
      create: {
        organizationId: organization.id,
        brandId: brand.id,
        externalId: seedOutlet.code,
        name: seedOutlet.name,
        code: seedOutlet.code,
        timezone: "Asia/Jakarta"
      }
    });

    await prisma.outletDataSource.upsert({
      where: { dataSourceId_externalOutletId: { dataSourceId: source.id, externalOutletId: seedOutlet.code } },
      update: {},
      create: {
        organizationId: organization.id,
        outletId: outlet.id,
        dataSourceId: source.id,
        externalOutletId: seedOutlet.code
      }
    });

    for (let daysAgo = 89; daysAgo >= 0; daysAgo -= 1) {
      const date = dateOnly(daysAgo);
      const seasonality = 1 + Math.sin(daysAgo / 6) * 0.08;
      const decline = seedOutlet.code === "DEMO_B" && daysAgo < 21 ? 0.78 : 1;
      const netSales = Math.round(seedOutlet.baseSales * seasonality * decline);
      const grossSales = Math.round(netSales * 1.08);
      const discountAmount = Math.round(grossSales - netSales);
      const cogs = Math.round(netSales * (seedOutlet.hpp / 100));
      const opex = Math.round(netSales * (seedOutlet.code === "DEMO_B" ? 0.31 : 0.22));
      const transactionCount = Math.max(40, Math.round(netSales / 95000));
      const averageOrderValue = Math.round(netSales / transactionCount);
      const grossProfit = netSales - cogs;
      const metricDate = date;

      await prisma.dailyOutletMetric.upsert({
        where: { outletId_metricDate: { outletId: outlet.id, metricDate } },
        update: {},
        create: {
          organizationId: organization.id,
          outletId: outlet.id,
          metricDate,
          grossSales,
          netSales,
          transactionCount,
          averageOrderValue,
          cogs,
          hppPercentage: seedOutlet.hpp,
          opex,
          opexPercentage: Number(((opex / netSales) * 100).toFixed(4)),
          grossProfit,
          grossMarginPercentage: Number(((grossProfit / netSales) * 100).toFixed(4)),
          discountAmount,
          discountPercentage: Number(((discountAmount / grossSales) * 100).toFixed(4))
        }
      });
    }

    const snapshot = await prisma.outletHealthSnapshot.upsert({
      where: { outletId_snapshotDate: { outletId: outlet.id, snapshotDate: dateOnly(0) } },
      update: {},
      create: {
        organizationId: organization.id,
        outletId: outlet.id,
        snapshotDate: dateOnly(0),
        healthPolicyVersion: "mvp-v1",
        overallScore: seedOutlet.score,
        revenueScore: seedOutlet.code === "DEMO_B" ? 45 : 74,
        marginScore: seedOutlet.hpp > 40 ? 20 : seedOutlet.hpp > 38 ? 40 : seedOutlet.hpp > 35 ? 65 : 85,
        costScore: seedOutlet.code === "DEMO_B" ? 45 : 72,
        operationsScore: 76,
        status: seedOutlet.status
      }
    });

    if (seedOutlet.hpp > 38) {
      await prisma.healthIssue.create({
        data: {
          id: randomUUID(),
          organizationId: organization.id,
          outletId: outlet.id,
          snapshotId: snapshot.id,
          type: HealthIssueType.HIGH_HPP,
          severity: seedOutlet.hpp > 40 ? IssueSeverity.CRITICAL : IssueSeverity.WARNING,
          title: "HPP is above target",
          description: "Synthetic demo issue: measured food cost ratio is above the MVP target threshold.",
          metricName: "hpp_percentage",
          currentValue: seedOutlet.hpp,
          targetValue: 40,
          financialImpactEstimate: seedOutlet.code === "DEMO_B" ? 7800000 : 2400000,
          status: IssueStatus.OPEN
        }
      });
    }
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
