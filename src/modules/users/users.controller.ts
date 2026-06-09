import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/profile-response.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({
    summary: 'Создать пользователя (ADMIN)',
    description:
      'Административный CRUD по пользователям — весь контроллер доступен только роли ADMIN. ' +
      'Создаёт пользователя напрямую, в обход обычной регистрации. Для своего профиля пользователи используют /auth/* .',
  })
  @ApiCreatedResponse({ type: UserResponseDto })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Список всех пользователей (ADMIN)',
    description: 'Возвращает всех пользователей системы. Только для роли ADMIN.',
  })
  @ApiOkResponse({ type: [UserResponseDto] })
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Получить пользователя по id (ADMIN)',
    description:
      'Возвращает любого пользователя по id. Только для роли ADMIN. Несуществующий id → 404.',
  })
  @ApiOkResponse({ type: UserResponseDto })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Обновить пользователя (ADMIN)',
    description:
      'Частично обновляет любого пользователя по id, включая поля, недоступные через /auth/me (например role). Только для ADMIN.',
  })
  @ApiOkResponse({ type: UserResponseDto })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Удалить пользователя (ADMIN)',
    description:
      'Удаляет пользователя по id. Внимание: каскадно удаляются все его данные — траты, доходы, категории, токены и т.д. Только для ADMIN.',
  })
  @ApiOkResponse({ type: UserResponseDto, description: 'Удалённый пользователь' })
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
