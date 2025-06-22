import random
import csv
import statistics
import matplotlib.pyplot as plt

# Пороговые значения для каждой стратегии (по оставшимся броскам, начиная с 9-го)
strategy1_thresholds = [85.48, 84.14, 82.53, 80.54, 78.01, 74.67, 70.03, 63.00, 50.50]
strategy2_thresholds = [93, 92, 91, 89, 87, 84, 79, 71, 50]

N = 100000  # количество игр

def play_strategy(thresholds, inclusive):
    results = []
    for _ in range(N):
        for throw in range(10):
            roll = random.randint(1, 100)
            if throw == 9:
                results.append(roll)
                break
            threshold = thresholds[throw]
            if inclusive:
                if roll >= threshold:
                    results.append(roll)
                    break
            else:
                if roll > threshold:
                    results.append(roll)
                    break
    return results

results1 = play_strategy(strategy1_thresholds, inclusive=False)
results2 = play_strategy(strategy2_thresholds, inclusive=True)

# Запись в файл
with open("cube_results.csv", "w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["Стратегия 1", "Стратегия 2"])
    for a, b in zip(results1, results2):
        writer.writerow([a, b])

# Вывод в консоль статистики
mean1 = statistics.mean(results1)
median1 = statistics.median(results1)
mean2 = statistics.mean(results2)
median2 = statistics.median(results2)

print(f"Стратегия 1: среднее = {mean1:.2f}, медиана = {median1}")
print(f"Стратегия 2: среднее = {mean2:.2f}, медиана = {median2}")

# Детальная гистограмма
bins = range(1, 102, 1)  # 1–101, чтобы захватить 100 как правую границу

plt.figure(figsize=(14, 7))
plt.hist(results1, bins=bins, alpha=0.5, label=f'Стратегия 1\nсреднее={mean1:.2f}, медиана={median1}', edgecolor='black')
plt.hist(results2, bins=bins, alpha=0.5, label=f'Стратегия 2\nсреднее={mean2:.2f}, медиана={median2}', edgecolor='black')
plt.xticks(range(0, 101, 5))
plt.xlim(1, 100)
plt.xlabel('Выплата (тыс. $)')
plt.ylabel('Количество игр')
plt.title(f'Распределение выигрыша (N={N} игр)')
plt.legend(loc='upper left')
plt.grid(axis='y', linestyle=':', alpha=0.7)


plt.tight_layout()
plt.show()


# https://chatgpt.com/share/6857dc1a-1b90-800d-9a8b-8a9b4a5039dd
