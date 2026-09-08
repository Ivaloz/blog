---
title: 'VitePress 博客搭建记录'
date: 2026-08-19
tags:
  - VitePress
  - GitHub Pages
  - 博客
categories:
  - 技术
description: '从零搭建 VitePress 博客的完整流程，包括域名申请、CDN 配置、自动部署。'
featured: true
---

# VitePress 博客搭建记录

## 域名

通过 [FreeDNS](https://freedns.afraid.org) 注册了免费域名 `idcade.mooo.com`，即时生效。

## CDN

使用 Cloudflare 免费计划，提供 DNS 解析、SSL 证书、全球 CDN 加速。

## 部署

- **框架**: VitePress（Vue + Vite）
- **托管**: GitHub Pages
- **CI/CD**: GitHub Actions 自动构建部署
- **评论**: Giscus（基于 GitHub Discussions）

## 费用

全部免费。域名、CDN、托管、SSL 均为零成本。
