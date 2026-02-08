/*
  Warnings:

  - The primary key for the `ComicJob` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `GenerationLog` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `User` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Changed the type of `id` on the `ComicJob` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `userId` to the `ComicJob` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `id` on the `GenerationLog` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `jobId` on the `GenerationLog` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `User` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "ComicJob" DROP CONSTRAINT "ComicJob_userId_fkey";

-- DropForeignKey
ALTER TABLE "GenerationLog" DROP CONSTRAINT "GenerationLog_jobId_fkey";

-- AlterTable
ALTER TABLE "ComicJob" DROP CONSTRAINT "ComicJob_pkey",
ADD COLUMN     "character1Name" TEXT,
ADD COLUMN     "character2Name" TEXT,
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "userId",
ADD COLUMN     "userId" UUID NOT NULL,
ADD CONSTRAINT "ComicJob_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "GenerationLog" DROP CONSTRAINT "GenerationLog_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "jobId",
ADD COLUMN     "jobId" UUID NOT NULL,
ADD CONSTRAINT "GenerationLog_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "User" DROP CONSTRAINT "User_pkey",
ADD COLUMN     "freeGenerationsCount" INTEGER NOT NULL DEFAULT 0,
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
ADD CONSTRAINT "User_pkey" PRIMARY KEY ("id");

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'success',
    "userEmail" TEXT,
    "phoneNumber" TEXT,
    "comicJobId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_paymentId_key" ON "Payment"("paymentId");

-- AddForeignKey
ALTER TABLE "ComicJob" ADD CONSTRAINT "ComicJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationLog" ADD CONSTRAINT "GenerationLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ComicJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
