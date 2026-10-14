---
title: "$2. [CODEFORCES] A. Team"
date: 2024-01-05
description: "세 친구 중 두 명 이상이 확신하는 문제의 수를 각 줄 0/1 세 값의 합이 2 이상인지로 세는 풀이"
tags:
  - "Codeforces"
  - "브루트포스"
  - "그리디"
  - "Rating800"
thumbnail: "images/cover.jpg"
---

![Codeforces 231A A. Team 문제 대표 이미지](images/cover.jpg)

## Condition
time limit per test : 2 seconds  
memory limit per test : 256 megabytes  
input : standard input  
output : standard output  

## Prob : [A. Team](https://codeforces.com/problemset/problem/231/A)
어느 날 세 명의 가장 친한 친구 Petya, Vasya 및 Tonya는 팀을 구성하고 프로그래밍 콘테스트에 참가하기로 결정했습니다. 참가자들은 일반적으로 프로그래밍 콘테스트 도중에 몇 가지 문제를 제시받습니다. 시작하기 오래 전에 친구들은 적어도 두 명이 해결책에 대해 확신할 경우 문제를 구현하기로 결정했습니다. 그렇지 않으면 친구들은 문제의 해결책을 쓰지 않을 것입니다.

이 콘테스트는 참가자들에게 n개의 문제를 제공합니다. 우리가 알고 있는 각 문제에 대해 어느 친구가 해결책을 확신합니까? 친구들이 해결책을 쓸 수 있는 문제 수를 찾도록 도와주세요.

## INPUT
첫 번째 입력 줄에는 콘테스트의 문제 수인 단일 정수 $n(1 ≤ n ≤ 1000)$이 포함됩니다. 그런 다음 $n$ 줄에는 각각 세 개의 정수가 포함되며 각 정수는 0 또는 1입니다. 줄의 첫 번째 숫자가 1이면 Petya는 문제의 해결책을 확신하고 그렇지 않으면 확신하지 못합니다. 두 번째 숫자는 솔루션에 대한 Vasya의 견해를 나타내고, 세 번째 숫자는 Tonya의 견해를 나타냅니다. 줄의 숫자는 공백으로 구분됩니다.

## OUTPUT
한 개의 정수를 출력하세요 — 친구들이 대회에서 구현할 문제의 수입니다.

## Sol
입력하는 각 줄마다 3개의 0 또는 1의 값이 주어지게 되는데, 이들의 합에 대해 생각해보자. 그것은 0 ~ 3의 값을 가지게 될 것이다. 이 때, 0과 1인 경우에는 세 명의 친구들이 해결할 수 없는 경우이다. 따라서 합의 값이 1보다 크기만 하면 되겠다. 이 로직을 입력하는 각 줄마다 계산하면서 카운팅하면 된다. 이를 바탕으로 작성한 코드는 아래와 같다.

## Code
```c
#define _CRT_SECURE_NO_WARNINGS
#include <stdio.h>
int main()
{
	int n, i, j, num, cnt = 0, x;
	scanf("%d", &n);
	for (i = 0; i < n; i++)
	{
		num = 0;
		for (j = 0; j < 3; j++)
		{
			scanf("%d", &x);
			num += x;
		}
		if (num > 1) cnt++;
	}
	printf("%d", cnt);
	return 0;
}
```

{{< en >}}
![Codeforces 231A A. Team problem cover](images/cover.jpg)

## Condition {#en-condition}
time limit per test : 2 seconds  
memory limit per test : 256 megabytes  
input : standard input  
output : standard output  

## Prob : [A. Team](https://codeforces.com/problemset/problem/231/A) {#en-prob-a-team}
One day three best friends Petya, Vasya and Tonya decided to form a team and take part in programming contests. Participants are usually offered several problems during programming contests. Long before the start the friends decided that they will implement a problem if at least two of them are sure about the solution. Otherwise, the friends won't write the problem's solution.

This contest offers n problems to the participants. For each problem we know, which friend is sure about the solution. Help the friends find the number of problems for which they will write a solution.

## INPUT {#en-input}
The first input line contains a single integer n (1 ≤ n ≤ 1000) — the number of problems in the contest. Then n lines contain three integers each, each integer is either 0 or 1. If the first number in the line equals 1, then Petya is sure about the problem's solution, otherwise he isn't sure. The second number shows Vasya's view on the solution, the third number shows Tonya's view. The numbers on the lines are separated by spaces.

## OUTPUT {#en-output}
Print a single integer — the number of problems the friends will implement on the contest.

## Sol {#en-sol}
For each line you enter, you are given three values of 0 or 1. Let's think about the sum of these. It will have values from 0 to 3. In this case, in the case of 0 and 1, the three friends cannot solve the problem. Therefore, the sum value only needs to be greater than 1. All you need to do is calculate this logic for each line you input. The code written based on this is as follows.

## Code {#en-code}
```c
#define _CRT_SECURE_NO_WARNINGS
#include <stdio.h>
int main()
{
	int n, i, j, num, cnt = 0, x;
	scanf("%d", &n);
	for (i = 0; i < n; i++)
	{
		num = 0;
		for (j = 0; j < 3; j++)
		{
			scanf("%d", &x);
			num += x;
		}
		if (num > 1) cnt++;
	}
	printf("%d", cnt);
	return 0;
}
```
{{< /en >}}
