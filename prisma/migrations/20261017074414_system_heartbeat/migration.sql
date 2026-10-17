-- CreateTable
CREATE TABLE "SystemHeartbeat" (
    "name" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "info" JSONB,

    CONSTRAINT "SystemHeartbeat_pkey" PRIMARY KEY ("name")
);
