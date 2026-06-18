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
    summary: 'Create a user (ADMIN)',
    description:
      'Administrative CRUD over users — the whole controller is available only to the ADMIN role. ' +
      'Creates a user directly, bypassing normal registration. For their own profile, users use /auth/* .',
  })
  @ApiCreatedResponse({ type: UserResponseDto })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List all users (ADMIN)',
    description: 'Returns all users in the system. ADMIN role only.',
  })
  @ApiOkResponse({ type: [UserResponseDto] })
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a user by id (ADMIN)',
    description: 'Returns any user by id. ADMIN role only. A non-existent id → 404.',
  })
  @ApiOkResponse({ type: UserResponseDto })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a user (ADMIN)',
    description:
      'Partially updates any user by id, including fields not available via /auth/me (e.g. role). ADMIN only.',
  })
  @ApiOkResponse({ type: UserResponseDto })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a user (ADMIN)',
    description:
      'Deletes a user by id. Warning: all their data is cascade-deleted — expenses, income, categories, tokens, etc. ADMIN only.',
  })
  @ApiOkResponse({ type: UserResponseDto, description: 'The deleted user' })
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
