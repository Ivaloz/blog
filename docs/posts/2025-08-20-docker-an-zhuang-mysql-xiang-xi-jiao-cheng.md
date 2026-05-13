---
title: 'Docker 安装 MySQL 详细教程'
date: 2025-08-20
slug: 'docker-an-zhuang-mysql-xiang-xi-jiao-cheng'
categories:
  - '容器与运维'
tags:
  - 'Docker'
  - 'MySQL'
  - '软件安装'
source: halo
description: '从拉取镜像、运行容器、数据持久化、自定义 my.cnf、字符集与时区、Docker Compose、主从复制、备份与恢复，到安全与性能调优，一篇完整的 Docker 安装 MySQL 详细教程。'
---

# Docker 安装 MySQL 详细教程

## 环境准备

在开始之前，请确保系统满足以下要求：

- 已安装 Docker（版本 20.10 或更高）
- 具备基本的 Linux 命令行操作能力
- 系统具有足够的存储空间和内存（建议至少 1GB 可用内存）
- 主机 3306 端口未被占用（或准备使用其它端口映射）

## 1. 拉取 MySQL 镜像

首先，从 Docker Hub 拉取官方 MySQL 镜像：

```
# 拉取最新版本的 MySQL 镜像
docker pull mysql:latest

# 或者指定特定版本（推荐）
docker pull mysql:8.0
```

推荐使用指定版本的方式，这样可以确保环境的一致性和稳定性。MySQL 8.0 是当前主流的 LTS 版本，新项目建议直接使用。

## 2. 运行 MySQL 容器

### 2.1 基础运行命令

使用以下命令启动一个 MySQL 实例：

```
# 基础运行
docker run -d \
  --name mysql-container \
  -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=your_password \
  mysql:8.0
```

参数说明：

- `-d`: 后台运行容器
- `--name`: 指定容器名称
- `-p`: 端口映射（主机端口:容器端口）
- `-e MYSQL_ROOT_PASSWORD`: 设置 root 账号密码（**必填**，否则容器启动失败）

### 2.2 创建初始库与业务账号

实际项目中往往不会直接用 root 连业务，可以在启动时一次性创建好库和账号：

```
docker run -d \
  --name mysql-container \
  -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=your_password \
  -e MYSQL_DATABASE=app_db \
  -e MYSQL_USER=app_user \
  -e MYSQL_PASSWORD=app_password \
  mysql:8.0
```

环境变量说明：

- `MYSQL_DATABASE`: 启动时自动创建的数据库名
- `MYSQL_USER` / `MYSQL_PASSWORD`: 创建的业务账号，对 `MYSQL_DATABASE` 自动授予全部权限

### 2.3 高级配置运行

为了更好地管理 MySQL，建议同时挂载数据卷和配置文件：

```
docker run -d \
  --name mysql-container \
  -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=your_password \
  -v mysql-data:/var/lib/mysql \
  -v mysql-conf:/etc/mysql/conf.d \
  -v mysql-logs:/var/log/mysql \
  mysql:8.0 \
  --character-set-server=utf8mb4 \
  --collation-server=utf8mb4_unicode_ci
```

## 3. 数据持久化配置

MySQL 数据保存在容器内的 `/var/lib/mysql` 目录。容器一旦被删除，里面的数据全部丢失，因此持久化是必须步骤。

### 3.1 使用命名卷（推荐）

```
# 创建命名卷
docker volume create mysql-data
# 运行容器并挂载卷
docker run -d \
  --name mysql-container \
  -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=your_password \
  -v mysql-data:/var/lib/mysql \
  mysql:8.0
```

### 3.2 使用绑定挂载

```
# 创建本地目录
mkdir -p /opt/mysql/data
# 运行容器并绑定挂载
docker run -d \
  --name mysql-container \
  -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=your_password \
  -v /opt/mysql/data:/var/lib/mysql \
  mysql:8.0
```

绑定挂载方便直接在主机上备份和迁移数据目录，但要注意宿主目录的权限必须允许容器内 mysql 用户（UID 999）读写。

## 4. 自定义配置

### 4.1 创建自定义配置文件

创建 `my.cnf` 配置文件：

```
[mysqld]
# 基础配置
port = 3306
bind-address = 0.0.0.0
default-authentication-plugin = mysql_native_password

# 字符集与排序规则
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci

# 时区
default-time-zone = '+08:00'

# 连接配置
max_connections = 500
max_connect_errors = 1000
wait_timeout = 28800
interactive_timeout = 28800

# InnoDB 配置
innodb_buffer_pool_size = 512M
innodb_log_file_size = 128M
innodb_flush_log_at_trx_commit = 1
innodb_flush_method = O_DIRECT

# 慢查询日志
slow_query_log = 1
slow_query_log_file = /var/log/mysql/slow.log
long_query_time = 1

# binlog 配置（主从复制必备）
server-id = 1
log-bin = mysql-bin
binlog_format = ROW
expire_logs_days = 7

[client]
default-character-set = utf8mb4

[mysql]
default-character-set = utf8mb4
```

### 4.2 挂载配置文件

```
# 创建配置目录
mkdir -p /opt/mysql/conf
# 将上面的配置保存为 /opt/mysql/conf/my.cnf
# 运行容器并挂载配置
docker run -d \
  --name mysql-container \
  -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=your_password \
  -v /opt/mysql/data:/var/lib/mysql \
  -v /opt/mysql/conf/my.cnf:/etc/mysql/conf.d/my.cnf \
  -v /opt/mysql/logs:/var/log/mysql \
  mysql:8.0
```

注意：官方镜像会读取 `/etc/mysql/conf.d/` 下的所有 `.cnf` 文件，所以挂载到这个目录即可，不要去覆盖 `/etc/mysql/my.cnf` 本身。

## 5. 容器管理命令

### 5.1 常用管理命令

```
# 查看运行中的容器
docker ps
# 查看容器日志
docker logs mysql-container
# 实时跟踪日志
docker logs -f mysql-container
# 进入容器内部
docker exec -it mysql-container bash
# 停止容器
docker stop mysql-container
# 启动容器
docker start mysql-container
# 重启容器
docker restart mysql-container
# 删除容器（数据卷不会一起删）
docker rm mysql-container
```

### 5.2 连接 MySQL

```
# 在容器内部使用 mysql 客户端连接
docker exec -it mysql-container mysql -uroot -p
# 一行直连
docker exec -it mysql-container mysql -uroot -pyour_password
# 在主机上连接（需先安装 mysql-client）
mysql -h 127.0.0.1 -P 3306 -uroot -pyour_password
# 使用业务账号连接指定库
mysql -h 127.0.0.1 -P 3306 -uapp_user -papp_password app_db
```

注意：命令行中使用 `-p密码` 中间不能有空格；在生产环境推荐用 `mysql_config_editor` 或交互式输入避免密码进入 shell history。

## 6. 使用 Docker Compose（推荐）

创建 `docker-compose.yml` 文件：

```
version: '3.8'
services:
  mysql:
    image: mysql:8.0
    container_name: mysql-container
    restart: always
    command:
      - --character-set-server=utf8mb4
      - --collation-server=utf8mb4_unicode_ci
      - --default-authentication-plugin=mysql_native_password
    ports:
      - "3306:3306"
    environment:
      MYSQL_ROOT_PASSWORD: your_password
      MYSQL_DATABASE: app_db
      MYSQL_USER: app_user
      MYSQL_PASSWORD: app_password
      TZ: Asia/Shanghai
    volumes:
      - mysql-data:/var/lib/mysql
      - ./mysql/conf:/etc/mysql/conf.d
      - ./mysql/logs:/var/log/mysql
    networks:
      - mysql-network
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-uroot", "-pyour_password"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  mysql-data:

networks:
  mysql-network:
    driver: bridge
```

运行命令：

```
# 启动服务
docker-compose up -d
# 停止服务
docker-compose down
# 查看服务状态
docker-compose ps
# 查看日志
docker-compose logs -f mysql
```

## 7. 高级配置选项

### 7.1 主从复制配置

主节点 `my-master.cnf`：

```
[mysqld]
server-id = 1
log-bin = mysql-bin
binlog_format = ROW
binlog_do_db = app_db
```

从节点 `my-slave.cnf`：

```
[mysqld]
server-id = 2
relay-log = mysql-relay-bin
read_only = 1
```

启动主从容器：

```
# 主节点
docker run -d \
  --name mysql-master \
  -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=your_password \
  -v /opt/mysql/master/data:/var/lib/mysql \
  -v /opt/mysql/master/my.cnf:/etc/mysql/conf.d/my.cnf \
  mysql:8.0

# 从节点
docker run -d \
  --name mysql-slave \
  -p 3307:3306 \
  -e MYSQL_ROOT_PASSWORD=your_password \
  -v /opt/mysql/slave/data:/var/lib/mysql \
  -v /opt/mysql/slave/my.cnf:/etc/mysql/conf.d/my.cnf \
  mysql:8.0
```

在主节点创建复制账号，在从节点执行 `CHANGE MASTER TO` 与 `START SLAVE`：

```
-- 主节点
CREATE USER 'repl'@'%' IDENTIFIED WITH mysql_native_password BY 'repl_password';
GRANT REPLICATION SLAVE ON *.* TO 'repl'@'%';
FLUSH PRIVILEGES;
SHOW MASTER STATUS;  -- 记下 File 和 Position

-- 从节点
CHANGE MASTER TO
  MASTER_HOST='mysql-master',
  MASTER_USER='repl',
  MASTER_PASSWORD='repl_password',
  MASTER_LOG_FILE='mysql-bin.000001',
  MASTER_LOG_POS=154;
START SLAVE;
SHOW SLAVE STATUS\G  -- Slave_IO_Running 与 Slave_SQL_Running 都为 Yes 即成功
```

### 7.2 使用 Docker Compose 编排主从

```
version: '3.8'
services:
  mysql-master:
    image: mysql:8.0
    container_name: mysql-master
    environment:
      MYSQL_ROOT_PASSWORD: your_password
    command:
      - --server-id=1
      - --log-bin=mysql-bin
      - --binlog_format=ROW
    ports:
      - "3306:3306"
    volumes:
      - master-data:/var/lib/mysql
    networks:
      - mysql-net

  mysql-slave:
    image: mysql:8.0
    container_name: mysql-slave
    environment:
      MYSQL_ROOT_PASSWORD: your_password
    command:
      - --server-id=2
      - --relay-log=mysql-relay-bin
      - --read_only=1
    ports:
      - "3307:3306"
    depends_on:
      - mysql-master
    volumes:
      - slave-data:/var/lib/mysql
    networks:
      - mysql-net

volumes:
  master-data:
  slave-data:

networks:
  mysql-net:
    driver: bridge
```

## 8. 安全配置建议

### 8.1 基础安全配置

1. **设置强 root 密码**：避免使用弱密码或常见密码
2. **创建独立业务账号**：业务应用不要使用 root
3. **最小权限授权**：只给业务账号所需库的所需权限
4. **禁止公网直连**：通过 Nginx/堡垒机/内网网关访问
5. **使用非默认端口**：将 3306 映射到非标准端口

### 8.2 进入容器执行安全初始化

```
# 进入容器
docker exec -it mysql-container mysql -uroot -p

# 删除匿名用户
DELETE FROM mysql.user WHERE User='';
# 限制 root 仅本地登录
DELETE FROM mysql.user WHERE User='root' AND Host NOT IN ('localhost', '127.0.0.1', '::1');
# 移除 test 库
DROP DATABASE IF EXISTS test;
FLUSH PRIVILEGES;
```

### 8.3 网络隔离

```
# 创建专用网络
docker network create mysql-network
# 在专用网络中运行容器（不再对宿主暴露端口）
docker run -d \
  --name mysql-container \
  --network mysql-network \
  -e MYSQL_ROOT_PASSWORD=your_password \
  -v mysql-data:/var/lib/mysql \
  mysql:8.0
```

应用容器加入同一个 `mysql-network` 后，直接用容器名 `mysql-container` 作为主机名访问即可，主机上根本不暴露 3306 端口。

## 9. 性能优化

### 9.1 内存与缓冲池

InnoDB Buffer Pool 是 MySQL 性能的关键。一般建议设为可用内存的 50%~70%：

```
docker run -d \
  --name mysql-container \
  -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=your_password \
  -v mysql-data:/var/lib/mysql \
  mysql:8.0 \
  --innodb_buffer_pool_size=1G \
  --innodb_log_file_size=256M \
  --max_connections=500
```

### 9.2 资源限制

避免单个 MySQL 容器把宿主机吃光：

```
docker run -d \
  --name mysql-container \
  -p 3306:3306 \
  --memory=2g \
  --cpus=2 \
  -e MYSQL_ROOT_PASSWORD=your_password \
  -v mysql-data:/var/lib/mysql \
  mysql:8.0
```

### 9.3 慢查询分析

慢查询日志是定位性能瓶颈最直接的方式：

```
# 在 my.cnf 中开启
slow_query_log = 1
slow_query_log_file = /var/log/mysql/slow.log
long_query_time = 1
log_queries_not_using_indexes = 1
```

查看慢查询：

```
docker exec -it mysql-container tail -f /var/log/mysql/slow.log
# 或使用 mysqldumpslow 归类统计
docker exec -it mysql-container mysqldumpslow -s t -t 10 /var/log/mysql/slow.log
```

## 10. 备份与恢复

### 10.1 使用 mysqldump 备份

```
# 备份单个库
docker exec mysql-container \
  mysqldump -uroot -pyour_password --single-transaction app_db > app_db.sql

# 备份所有库
docker exec mysql-container \
  mysqldump -uroot -pyour_password --all-databases --single-transaction > all.sql

# 备份指定表
docker exec mysql-container \
  mysqldump -uroot -pyour_password app_db users orders > tables.sql
```

`--single-transaction` 适合 InnoDB 在线备份，不会锁表。

### 10.2 恢复数据

```
# 通过管道导入
docker exec -i mysql-container mysql -uroot -pyour_password app_db < app_db.sql

# 进入容器内导入
docker cp app_db.sql mysql-container:/tmp/
docker exec -it mysql-container bash
mysql -uroot -p app_db < /tmp/app_db.sql
```

### 10.3 物理备份（冷备）

如果数据量较大，`mysqldump` 太慢，可以直接备份数据目录（必须先停容器，否则文件不一致）：

```
docker stop mysql-container
tar -czvf mysql-backup-$(date +%F).tar.gz /opt/mysql/data
docker start mysql-container
```

生产环境推荐用 `xtrabackup` 做热备，本文不再展开。

## 11. 监控与维护

### 11.1 查看 MySQL 状态

```
# 查看全局状态
docker exec -it mysql-container mysql -uroot -pyour_password -e "SHOW GLOBAL STATUS;"
# 查看连接数
docker exec -it mysql-container mysql -uroot -pyour_password -e "SHOW PROCESSLIST;"
# 查看 InnoDB 状态
docker exec -it mysql-container mysql -uroot -pyour_password -e "SHOW ENGINE INNODB STATUS\G"
# 查看 buffer pool 命中率
docker exec -it mysql-container mysql -uroot -pyour_password -e "SHOW STATUS LIKE 'Innodb_buffer_pool_read%';"
```

### 11.2 常见问题排查

- **容器启动后立即退出**：先看 `docker logs mysql-container`，最常见的是没有设置 `MYSQL_ROOT_PASSWORD` 或挂载的目录权限不对
- **客户端连接报 caching_sha2_password 错误**：旧客户端不兼容 8.0 默认加密插件，加 `--default-authentication-plugin=mysql_native_password` 或升级客户端
- **时区不对**：容器默认 UTC，启动时加 `-e TZ=Asia/Shanghai`，或在 `my.cnf` 里设 `default-time-zone='+08:00'`
- **中文乱码**：确保 server、database、table、connection 四层全部是 `utf8mb4` / `utf8mb4_unicode_ci`

## 12. 简单命令

最常用的一行启动命令，适合本地开发或快速验证：

```
docker run -d --name mysql -p 3306:3306 -e MYSQL_ROOT_PASSWORD=123456 -v mysql-data:/var/lib/mysql mysql:8.0
```
