# Tvijo DSHREM — 从任务到经过检查的结果

[English](README.en.md) · [Русский](README.ru.md) · [All languages / Все языки](../../README.md#read-the-introductory-guide-in-your-language)

Tvijo 围绕共享的开发工作流程，提供浏览器工作区、VS Code 扩展和终端工具。请描述任务、选择其执行主机和权限、检查所做的更改，并保留用于确认结果的证据。本指南是对产品的介绍；仓库的技术 README 和命令参考仍然是 CLI 的权威说明。

## 从你偏好的工作区开始

打开 [DSHREM](https://dsh.tvijo.com/)，获取 [VS Code 扩展和终端说明](https://dsh.tvijo.com/download)，或阅读[设置说明](https://dsh.tvijo.com/knowledge/settings-explained)。通过该服务支持的账户流程登录。切勿将提供方的 API 密钥粘贴到共享提示词、公开 issue 或仓库中。

Node.js CLI 需要 Node 22 或更高版本。从本地检出副本执行：

```sh
npm install -g .
dsh login
dsh doctor
dsh chat
```

该命令也可通过 `dshrem` 使用。这个远程聊天 CLI 会显示建议的工具，但不会执行它们。本地编辑和命令执行属于 VS Code Agent 或显式配置的主机运行时；它们具有各自独立的权限。参见 [CLI 帮助](https://github.com/nikbibamon/dshrempub/blob/main/docs/HELP.md)。

## 理解各项选择

**证据优先**将有依据的事实与假设区分开来。**计划并检查**要求给出简短计划，并对照请求检查结果。**审查答案**会对草稿提出质疑；除非明确指定了独立的审查者，否则这属于自我审查。这些方法均不保证正确性，也不保证更低的 token 用量。

任务预设会添加可复用的指令和检查清单。它们不会创建额外的模型记忆。更大的上下文集合仍须符合服务和模型的请求限制。高级控制器、Python 和状态路径指的是所选的扩展主机；在 Remote SSH 中，该主机就是远程服务器。

## 在有益时与团队协作

AGENTROY 团队为协调者、实现者和审查者分配不同的职责。主机策略可请求 DSHREM ds41f 以及基于账户的 Codex 或 Claude 工具，并可选用架构审查。可用性取决于已安装的运行时、账户访问权限和所选策略。缺失的订阅不得悄然变成付费 API 调用。

三到六个角色是组织上的选择，而不是质量公式。审查者需要确切的产物版本和测试证据。即使模型意见一致，一次严重的检查失败也会阻止验收。请阅读[智能体团队与可见成本](https://dsh.tvijo.com/knowledge/agentroy-teams-and-costs)。

## 在不确定时恢复，而不是掩盖

分离的服务器端 tmux 会话可以在笔记本电脑或手机断开后继续运行。在已关机的本地计算机上工作则无法继续。服务器故障、内存压力和存储丢失仍然需要恢复。请重新连接到已保存的任务 ID，并在开始更多工作之前检查其最后确认的事件。不要盲目重复结果未知的可计费请求。参见[断开连接与恢复](https://dsh.tvijo.com/knowledge/durable-work-and-recovery)。

## 让成本和数据保持可见

请查看已接受的报价、任务上限、预留金额和用量回执。8% 的服务加价会在另行披露的费用之前，将 USD1.00 的提供方用量变为 USD1.08；这是一个示例，并非价格报价。订阅配额、提供方收费和服务器资源是不同的限制。额外预算需要明确选择。

本地 CLI 凭据文件使用仅限所有者访问的权限。这些权限不是加密，也不是备份。知识上传是显式操作；私有文件绝不应进入公开的交接链接。[提示词交接](https://dsh.tvijo.com/knowledge/prompt-handoffs)说明了如何将经过审查的任务复制到另一个工具中。

本仓库的软件包当前标记为 `UNLICENSED`；公开发布并不授予再使用权利。在再分发之前，请查阅当前的软件包元数据和许可声明。翻译版本是介绍性指南，由 DSHREM 生成，并经过结构一致性检查；在技术方面出现不一致时，以英文版本为参照。
