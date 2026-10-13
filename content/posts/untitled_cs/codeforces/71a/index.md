+++
title = "$4. [CODEFORCES] A. Way Too Long Words"
date = "2024-01-07"
description = "길이가 10자를 넘는 단어를 첫 글자, 사이 글자 수, 마지막 글자로 줄여 출력하는 문자열 구현 풀이"
tags = ["Codeforces", "문자열", "Rating800"]
thumbnail = "images/cover.jpg"
+++

![Codeforces 71A A. Way Too Long Words 문제 대표 이미지](images/cover.jpg)

## Condition
time limit per test : 1 seconds  
memory limit per test : 256 megabytes  
input : standard input  
output : standard output  

## Prob : [A. Way Too Long Words](https://codeforces.com/problemset/problem/71/A)
때로는 "localization" 또는 "internationalization"처럼 일부 단어가 너무 길어서 한 텍스트에 여러 번 쓰는 것이 상당히 지루할 수 있습니다.

길이가 10자를 초과하는 경우 단어가 너무 긴 것으로 간주해 보겠습니다. 너무 긴 단어는 모두 특수 약어로 대체해야 합니다.

이 약어는 다음과 같이 만들어집니다. 단어의 첫 글자와 마지막 글자를 적고 그 사이에 첫 글자와 마지막 글자 사이의 글자 수를 씁니다. 해당 숫자는 10진수 체계로 되어 있으며 앞에 0이 포함되어 있지 않습니다.

따라서 "localization"은 "l10n"으로 표기되고 "internationalization"은 "i18n"으로 표기됩니다.

약어로 단어를 변경하는 프로세스를 자동화하는 것이 좋습니다. 이때 너무 긴 단어는 모두 약어로 대체해야 하며, 너무 길지 않은 단어는 변경하지 않아야 합니다.

## INPUT
첫 번째 줄에는 정수 $n(1 ≤ n ≤ 100)$이 포함됩니다. 다음 n개의 줄에는 각각 하나의 단어가 포함되어 있습니다. 모든 단어는 라틴 소문자로 구성되며 길이는 1~100글자입니다.

## OUTPUT
n 줄을 출력합니다. i번째 줄에는 입력 데이터에서 i번째 단어를 대체한 결과가 포함되어야 합니다.

## Sol
문제에서 요구하는대로 코드를 작성하면 되겠다. 이를 c++로 코딩하면 아래와 같다.

## Code
```c++
#define _CRT_SECURE_NO_WARNINGS
#include <iostream>
#include <string>
using namespace std;
int main()
{
	int n, i;
	string str;
	cin >> n; cin.ignore();
	for (i = 0; i < n; i++)
	{
		getline(cin, str);
		if (str.size() > 10) cout << str.front() << (str.size() - 2) << str.back() << '\n';
		else cout << str << '\n';
	}
	return 0;
}
```

{{< details summary="English version" class="lang-en" >}}
### Condition {#en-condition}
time limit per test : 1 seconds  
memory limit per test : 256 megabytes  
input : standard input  
output : standard output  

### Prob : [A. Way Too Long Words](https://codeforces.com/problemset/problem/71/A) {#en-prob-a-way-too-long-words}
Sometimes some words like "localization" or "internationalization" are so long that writing them many times in one text is quite tiresome.

Let's consider a word too long, if its length is **strictly more** than 10 characters. All too long words should be replaced with a special abbreviation.

This abbreviation is made like this: we write down the first and the last letter of a word and between them we write the number of letters between the first and the last letters. That number is in decimal system and doesn't contain any leading zeroes.

Thus, "localization" will be spelt as "l10n", and "internationalization» will be spelt as "i18n".

You are suggested to automatize the process of changing the words with abbreviations. At that all too long words should be replaced by the abbreviation and the words that are not too long should not undergo any changes.

### INPUT {#en-input}
The first line contains an integer $n (1 ≤ n ≤ 100)$. Each of the following n lines contains one word. All the words consist of lowercase Latin letters and possess the lengths of from 1 to 100 characters.

### OUTPUT {#en-output}
Print n lines. The i-th line should contain the result of replacing of the i-th word from the input data.

### Sol {#en-sol}
Just write the code as requested by the problem. Coding this in C++ is as follows.

### Code {#en-code}
_The code is the same as the Korean version above._
{{< /details >}}
