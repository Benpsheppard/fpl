# dataset_loader.py

# imports
import requests

NODE_API_URL = "http://localhost:8000"

def load_training_dataset():
    response = requests.get(f"{NODE_API_URL}/api/training/dataset")

    response.raise_for_status()

    data = response.json()

    print("Rows reported by Node: ", data["rows"])
    print("Rows received by Python: ", len(data["dataset"]))

    return data["dataset"]