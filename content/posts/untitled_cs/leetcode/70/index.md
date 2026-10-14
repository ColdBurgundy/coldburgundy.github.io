---
title: "$1. [LeetCode] 70. Climbing Stairs"
date: 2024-01-05
description: "한 번에 1칸 또는 2칸씩 오를 때 n개의 계단을 오르는 방법의 수를 dp[i] = dp[i-1] + dp[i-2] 점화식으로 구하는 풀이"
tags:
  - "LeetCode"
  - "수학"
  - "DP"
  - "메모이제이션"
thumbnail: "images/cover.jpg"
---

![LeetCode 70 70. Climbing Stairs 문제 대표 이미지](images/cover.jpg)

## Prob : [70. Climbing Stairs](https://leetcode.com/problems/climbing-stairs/description/)
당신은 계단을 오르고 있습니다. 정상에 도달하려면 n개의 계단이 필요합니다.

매번 1계단 혹은 2계단씩 오를 수 있습니다. 얼마나 많은 방법으로 정상에 오를 수 있나요?

**Example 1 :**
>**Input :** n = 2  
>**Output:** 2  
>**Explanation:** 정상에 오르는 방법은 2가지가 있다.  
>	1. 1 step + 1 step  
>	2. 2 steps  

**Example 2 :**
>**Input :** n = 3  
>**Output:** 3  
>**Explanation:** 정상에 오르는 방법은 3가지가 있다.  
>	1. 1 step + 1 step + 1 step  
>	2. 1 step + 2 steps  
>	3. 2 steps + 1 step  

## Sol

## Code
```c
int climbStairs(int n) {
    int dp[50],i;
    dp[1]=1; dp[2]=2;
    for(i=3; i<=n; i++)
        dp[i]=dp[i-1]+dp[i-2];
    return dp[n];
}
```

{{< en >}}
![LeetCode 70. Climbing Stairs problem cover](images/cover.jpg)

## Prob : [70. Climbing Stairs](https://leetcode.com/problems/climbing-stairs/description/) {#en-prob-70-climbing-stairs}
You are climbing a staircase. It takes n steps to reach the top.

Each time you can either climb 1 or 2 steps. In how many distinct ways can you climb to the top?

**Example 1 :**
>**Input :** n = 2  
>**Output:** 2  
>**Explanation:** There are two ways to climb to the top.  
>	1. 1 step + 1 step  
>	2. 2 steps  

**Example 2 :**
>**Input :** n = 3  
>**Output:** 3  
>**Explanation:** There are three ways to climb to the top.  
>	1. 1 step + 1 step + 1 step  
>	2. 1 step + 2 steps  
>	3. 2 steps + 1 step  

## Sol {#en-sol}
## Code {#en-code}
```c
int climbStairs(int n) {
    int dp[50],i;
    dp[1]=1; dp[2]=2;
    for(i=3; i<=n; i++)
        dp[i]=dp[i-1]+dp[i-2];
    return dp[n];
}
```
{{< /en >}}
