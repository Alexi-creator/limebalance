import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminPlansController } from './admin-plans.controller';
import { AdminPlansService } from './admin-plans.service';

@Module({
  controllers: [AdminController, AdminPlansController],
  providers: [AdminService, AdminPlansService],
})
export class AdminModule {}
