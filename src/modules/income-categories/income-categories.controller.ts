import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateIncomeCategoryDto } from './dto/create-income-category.dto';
import { UpdateIncomeCategoryDto } from './dto/update-income-category.dto';
import { IncomeCategoriesService } from './income-categories.service';

@ApiTags('income-categories')
@Controller('income-categories')
export class IncomeCategoriesController {
  constructor(private readonly incomeCategoriesService: IncomeCategoriesService) {}

  @Post()
  @ApiOperation({ summary: 'Создать категорию доходов' })
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateIncomeCategoryDto) {
    return this.incomeCategoriesService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Получить все категории доходов пользователя' })
  findAll(@CurrentUser() user: { id: string }) {
    return this.incomeCategoriesService.findAllByUser(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить категорию доходов по id' })
  findOne(@Param('id') id: string) {
    return this.incomeCategoriesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Обновить категорию доходов' })
  update(@Param('id') id: string, @Body() dto: UpdateIncomeCategoryDto) {
    return this.incomeCategoriesService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить категорию доходов' })
  remove(@Param('id') id: string) {
    return this.incomeCategoriesService.remove(id);
  }
}
