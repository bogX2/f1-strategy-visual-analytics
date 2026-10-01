import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from sklearn.cluster import KMeans
import json

#load stint data 
df = pd.read_csv('../data/stints_features.csv') # Assicurati che il percorso sia corretto

#map for the compound
compound_mapping = {'SOFT': 0, 'MEDIUM': 1, 'HARD': 2}
df['compound_encoded'] = df['Compound'].map(compound_mapping).fillna(1)

#select the features that will be involved in PCA
features = ['AvgLapTime', 'DegradationSlope', 'TotalLaps', 'TyreLifeStart', 'compound_encoded']

#manage missing value by filling with their mean
X = df[features].fillna(df[features].mean())

#standardization
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

#PCA computation
pca = PCA(n_components=2)
pcs = pca.fit_transform(X_scaled)
df['PC1'] = pcs[:, 0]
df['PC2'] = pcs[:, 1]

#clustering
kmeans = KMeans(n_clusters=3, random_state=42, n_init=10)
df['Cluster'] = kmeans.fit_predict(X_scaled)

# 7. Estrazione Varianza Spiegata
explained_variance = (pca.explained_variance_ratio_ * 100).tolist()

# 8. Estrazione Vettori di Loading per il Biplot
# Indicano quanto e in che direzione ogni feature originale influenza PC1 e PC2
loadings = []
nomi_leggibili = ["Avg LapTime", "Degradation", "Stint Length", "TyreLife Start", "Compound"]

for i, feature in enumerate(nomi_leggibili):
    loadings.append({
        "name": feature,
        "x": pca.components_[0, i],
        "y": pca.components_[1, i]
    })

#creation of json file with the results
output = {
    "variance": explained_variance,
    "loadings": loadings,
    "stints": df.to_dict(orient='records')
}

with open('../data/pca_data.json', 'w') as f:
    json.dump(output, f, indent=4)

print("File pca_data.json generato con successo! Pronto per D3.")