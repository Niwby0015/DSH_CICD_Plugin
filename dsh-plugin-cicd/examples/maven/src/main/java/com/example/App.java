package com.example;

public final class App {
  private App() {}

  public static int add(int a, int b) {
    return a + b;
  }

  public static void main(String[] args) {
    System.out.println(add(2, 3));
  }
}
