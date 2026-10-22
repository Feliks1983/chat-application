curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Password123!",
    "username": "testuser",
    "profile": {
      "firstName": "Test",
      "lastName": "User",
      "bio": "Test user bio"
    }
  }'

[POST]http://localhost:3000/api/auth/login
{
    "emailOrUsername": "test@example.com",
    "password": "Password123!"
}

[POST] http://localhost:3000/api/rooms
Authorization: Bearer ТВОЙ_JWT_ТОКЕН
{
  "name": "Test Room",
  "description": "Тестовая комната",
  "isPublic": true
}

Используйте именно значение room._id


