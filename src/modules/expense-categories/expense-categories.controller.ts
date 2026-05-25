import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto';
import { ExpenseCategoriesService } from './expense-categories.service';

@ApiTags('expense-categories')
@Controller('expense-categories')
export class ExpenseCategoriesController {
  constructor(private readonly expenseCategoriesService: ExpenseCategoriesService) {}

  @Post()
  @ApiOperation({ summary: 'Создать категорию расходов' })
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateExpenseCategoryDto) {
    return this.expenseCategoriesService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Получить все категории расходов пользователя' })
  findAll(@CurrentUser() user: { id: string }) {
    return this.expenseCategoriesService.findAllByUser(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить категорию расходов по id' })
  findOne(@Param('id') id: string) {
    return this.expenseCategoriesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Обновить категорию расходов' })
  update(@Param('id') id: string, @Body() dto: UpdateExpenseCategoryDto) {
    return this.expenseCategoriesService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить категорию расходов' })
  remove(@Param('id') id: string) {
    return this.expenseCategoriesService.remove(id);
  }
}
