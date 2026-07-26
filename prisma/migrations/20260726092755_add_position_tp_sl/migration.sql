-- AlterTable
ALTER TABLE "positions" ADD COLUMN     "stop_loss_price" DECIMAL(30,12),
ADD COLUMN     "take_profit_price" DECIMAL(30,12);
