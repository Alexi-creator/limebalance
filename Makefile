include .env
export

dev:
	-kill $$(lsof -ti:$(PORT)) 2>/dev/null
	npm run start:dev

ngrok:
	ngrok http $(PORT)

db-up:
	docker compose -f docker-compose.dev.yml up -d

db-down:
	docker compose -f docker-compose.dev.yml down

migrate:
	npx prisma migrate dev

migrate-create:
	@if [ -z "$(name)" ]; then \
		echo "Ошибка: укажи имя миграции, например: make migrate-create name=add_user_settings"; \
		exit 1; \
	fi
	npx prisma migrate dev --name $(name)

migrate-status:
	npx prisma migrate status

migrate-deploy:
	npx prisma migrate deploy

db-studio:
	npx prisma studio

set-webhook:
	curl -F "url=$(WEBHOOK_URL)/webhook" \
		https://api.telegram.org/bot$(BOT_TOKEN)/setWebhook

build:
	npm run build
