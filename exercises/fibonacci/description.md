# Fibonacci Sequence Generator

## Objective

Implement functions that generate Fibonacci numbers using the AI assistant.

## Requirements

1. Create a function `fibonacci(n)` that returns an array of the first `n` Fibonacci numbers
2. The function should handle edge cases (n = 0, n = 1, negative numbers)
3. Add basic input validation
4. Also implement `fibonacciUpTo(limit)`, which returns the Fibonacci numbers below `limit`
5. Write the implementation in `fibonacci.js`

## Fibonacci Sequence

The Fibonacci sequence is: 0, 1, 1, 2, 3, 5, 8, 13, 21, 34, ...

Each number is the sum of the two preceding ones:
- F(0) = 0
- F(1) = 1
- F(n) = F(n-1) + F(n-2) for n > 1

## Example Usage

```javascript
console.log(fibonacci(5));  // [0, 1, 1, 2, 3]
console.log(fibonacci(10)); // [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]
console.log(fibonacci(0));  // []
console.log(fibonacci(1));  // [0]
```

## Getting Started

1. Open `fibonacci.js` in the file explorer
2. Ask the AI assistant to help you implement the function
3. Test your implementation by asking the assistant to run it with sample inputs
4. Refine based on edge cases

## Success Criteria

- Function correctly generates Fibonacci numbers
- Edge cases are handled (n ≤ 0, n = 1)
- Code is readable and well-structured
- You can explain your approach to the interviewer

## Tips

- Start simple, then optimize
- Think about iterative vs recursive approaches
- Consider performance for large n values
- Test your edge cases

Good luck! 