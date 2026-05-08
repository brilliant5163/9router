docker stop 9routerx
docker rm 9routerx
docker build -t 9routerx .
docker run -d --name 9routerx -p 20128:20128 --env-file .env -v 9routerx-data:/app/data 9routerx
