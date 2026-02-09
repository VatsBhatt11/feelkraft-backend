-- CreateTable
CREATE TABLE "RefundRequest" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RefundRequest_jobId_key" ON "RefundRequest"("jobId");

-- AddForeignKey
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ComicJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
